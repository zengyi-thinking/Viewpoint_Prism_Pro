import { apiFetch, setToken } from './api';

interface AuthResponse {
  data: {
    user: { id: string; email: string; name?: string };
    token: string;
  };
}

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(res.data.token);
    return res.data;
  },

  register: async (email: string, password: string, name?: string) => {
    const res = await apiFetch<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    setToken(res.data.token);
    return res.data;
  },

  getMe: () =>
    apiFetch<{ data: { id: string; email: string; name?: string } }>('/api/auth/me'),
};
