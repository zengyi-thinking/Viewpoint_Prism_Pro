const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').trim();
const TOKEN_KEY = 'token';
const TOKEN_COOKIE_KEY = 'vp_token';

function normalizeBase(base: string): string {
  if (!base) return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function buildUrl(base: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function getApiBaseCandidates(): string[] {
  const candidates: string[] = [];
  const envBase = normalizeBase(API_BASE);

  if (envBase) {
    candidates.push(envBase);
  }

  // 未显式指定后端地址时，统一回退到同源 /api，
  // 由 Next rewrite 或上层反向代理决定实际后端目标。
  if (!envBase) {
    candidates.push('');
  }

  return Array.from(new Set(candidates.map((item) => normalizeBase(item))));
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split('=').slice(1).join('='));
}

function writeCookie(name: string, value: string, days = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function removeCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch {
    // Ignore storage access errors in embedded environments and fall back to cookie.
  }

  return readCookie(TOKEN_COOKIE_KEY);
}

export function setToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage access errors in embedded environments.
  }
  writeCookie(TOKEN_COOKIE_KEY, token);
}

export function removeToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage access errors in embedded environments.
  }
  removeCookie(TOKEN_COOKIE_KEY);
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(options?.headers || {});
  const hasBody = options?.body !== undefined && options?.body !== null;
  const isFormData =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const bases = getApiBaseCandidates();
  let res: Response | null = null;
  let lastNetworkError: unknown = null;
  let lastServerRes: Response | null = null;

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    try {
      const candidate = await fetch(buildUrl(base, path), { ...options, headers });
      const hasNextCandidate = i < bases.length - 1;

      // 某些环境下（例如 dev proxy）会返回 5xx，但直连后端可用，尝试下一候选基址。
      if (candidate.status >= 500 && hasNextCandidate) {
        lastServerRes = candidate;
        continue;
      }

      res = candidate;
      break;
    } catch (error) {
      lastNetworkError = error;
    }
  }

  if (!res && lastServerRes) {
    res = lastServerRes;
  }

  if (!res) {
    throw new Error(
      `网络连接失败：无法访问后端接口 ${path}。请确认后端服务已启动并暴露到当前站点。${
        lastNetworkError instanceof Error ? ` ${lastNetworkError.message}` : ''
      }`,
    );
  }

  if (res.status === 401) {
    removeToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new Error('未授权，请重新登录');
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await res.json().catch(() => ({}))
      : await res.text().catch(() => '');
    const message =
      typeof body === 'string'
        ? body
        : (body as { message?: string })?.message;
    throw new Error(message || `请求失败 (${res.status})`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  const json = JSON.parse(text);
  // Auto-extract data field from standard API response format
  return 'data' in json ? json.data : json;
}
