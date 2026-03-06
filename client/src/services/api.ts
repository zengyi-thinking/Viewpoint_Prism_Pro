const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').trim();

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

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const sameHost3001 = `${protocol}//${host}:3001`;
    if (!envBase) {
      candidates.push(sameHost3001);

      if (host !== 'localhost') candidates.push('http://localhost:3001');
      if (host !== '127.0.0.1') candidates.push('http://127.0.0.1:3001');
    }
  } else {
    if (!envBase) {
      candidates.push('http://localhost:3001');
    }
  }

  // 仅在没有显式后端地址时，才回退到 Next 的 rewrite 代理。
  if (!envBase) {
    candidates.push('');
  }

  return Array.from(
    new Set(candidates.map((item) => normalizeBase(item)).filter((item) => item !== '')),
  ).concat(envBase ? [] : ['']);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function removeToken() {
  localStorage.removeItem('token');
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
      `网络连接失败：无法访问后端接口 ${path}。请确认后端已启动（默认 3001 端口）。${
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
