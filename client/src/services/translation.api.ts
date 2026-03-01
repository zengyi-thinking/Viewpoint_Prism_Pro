import { apiFetch } from './api';

export const translationApi = {
  getTask: (id: string) => apiFetch(`/api/prism/translation/${id}`),
  createTask: (videoId: string, data: any) =>
    apiFetch(`/api/prism/translation`, { method: 'POST', body: JSON.stringify({ videoId, ...data }) }),
};
