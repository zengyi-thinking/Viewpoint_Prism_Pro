import { apiFetch } from './api';

export const creationApi = {
  getProject: (id: string) => apiFetch(`/api/prism/creation/${id}`),
  createNode: (projectId: string, data: any) =>
    apiFetch(`/api/prism/creation/${projectId}/nodes`, { method: 'POST', body: JSON.stringify(data) }),
};
