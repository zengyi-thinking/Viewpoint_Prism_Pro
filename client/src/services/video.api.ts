import { apiFetch } from './api';

export const videoApi = {
  list: (projectId: string) => apiFetch(`/api/projects/${projectId}/videos`),
  delete: (id: string) => apiFetch(`/api/videos/${id}`, { method: 'DELETE' }),
};
