import { apiFetch } from './api';

export const diffractionApi = {
  getTask: (id: string) => apiFetch(`/api/prism/diffraction/${id}`),
  generateDrafts: (videoId: string) =>
    apiFetch(`/api/prism/diffraction/generate`, { method: 'POST', body: JSON.stringify({ videoId }) }),
};
