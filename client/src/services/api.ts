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

  // 同源回退：利用 Next rewrite('/api/*' -> 'http://localhost:3001/api/*')
  candidates.push('');

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const sameHost3001 = `${protocol}//${host}:3001`;
    candidates.push(sameHost3001);

    if (host !== 'localhost') candidates.push('http://localhost:3001');
    if (host !== '127.0.0.1') candidates.push('http://127.0.0.1:3001');
  } else {
    candidates.push('http://localhost:3001');
  }

  return Array.from(new Set(candidates.map((item) => normalizeBase(item)).filter(Boolean).concat('')));
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

  for (const base of bases) {
    try {
      res = await fetch(buildUrl(base, path), { ...options, headers });
      break;
    } catch (error) {
      lastNetworkError = error;
    }
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
