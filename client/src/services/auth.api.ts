import { apiFetch, setToken } from './api';

interface AuthPayload {
  user: { id: string; email: string; name?: string };
  token: string;
}

export const authApi = {
  login: async (email: string, password: string) => {
    const payload = await apiFetch<AuthPayload>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!payload?.token || typeof payload.token !== 'string') {
      throw new Error('登录成功但未收到有效令牌');
    }
    setToken(payload.token);
    return payload;
  },

  register: async (email: string, password: string, name?: string) => {
    const payload = await apiFetch<AuthPayload>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    if (!payload?.token || typeof payload.token !== 'string') {
      throw new Error('注册成功但未收到有效令牌');
    }
    setToken(payload.token);
    return payload;
  },

  getMe: () => apiFetch<{ id: string; email: string; name?: string }>('/api/auth/me'),
};
