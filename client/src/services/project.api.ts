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

interface ProjectListResponse {
  data: Project[];
}

interface ProjectResponse {
  data: Project;
}

export const projectApi = {
  list: () => apiFetch<ProjectListResponse>('/api/projects').then((r) => r.data),

  get: (id: string) => apiFetch<ProjectResponse>(`/api/projects/${id}`).then((r) => r.data),

  create: (data: { name: string; description?: string }) =>
    apiFetch<ProjectResponse>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.data),

  update: (id: string, data: { name?: string; description?: string }) =>
    apiFetch<ProjectResponse>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }).then((r) => r.data),

  delete: (id: string) =>
    apiFetch(`/api/projects/${id}`, { method: 'DELETE' }),
};
