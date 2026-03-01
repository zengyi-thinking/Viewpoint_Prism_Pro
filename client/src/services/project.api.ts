import { apiFetch } from './api';

export interface Project {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { videos: number };
}

export const projectApi = {
  list: () => apiFetch<Project[]>('/api/projects'),

  get: (id: string) => apiFetch<Project>(`/api/projects/${id}`),

  create: (data: { name: string; description?: string }) =>
    apiFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; description?: string }) =>
    apiFetch<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch(`/api/projects/${id}`, { method: 'DELETE' }),
};
