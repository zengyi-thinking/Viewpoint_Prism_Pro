import { apiFetch, getToken } from './api';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:7860');

export type VideoSourceType = 'LOCAL_UPLOAD' | 'URL_IMPORT' | 'YOUTUBE' | 'BILIBILI';

export interface VideoSource {
  id: string;
  projectId: string;
  title: string;
  sourceType: VideoSourceType;
  sourceUrl?: string;
  storagePath: string;
  videoUrl: string;
  duration?: number;
  resolution?: string;
  fileSize?: number;
  thumbnailUrl?: string;
  transcriptStatus: string;
  keyframeStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportVideoDto {
  title: string;
  sourceType: VideoSourceType;
  sourceUrl: string;
}

export const videoApi = {
  list: (projectId: string) => apiFetch<VideoSource[]>(`/api/videos?projectId=${projectId}`),

  get: (id: string) => apiFetch<VideoSource>(`/api/videos/${id}`),

  getPlayUrl: (id: string) => apiFetch<{ url: string }>(`/api/videos/${id}/play`),

  import: (projectId: string, data: ImportVideoDto) =>
    apiFetch<VideoSource>(`/api/videos/import?projectId=${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Upload file directly to backend (bypasses Next.js proxy for FormData)
  upload: async (projectId: string, file: File, onProgress?: (progress: number) => void): Promise<VideoSource> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            onProgress(percentComplete);
          }
        });
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve('data' in response ? response.data : response);
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      // Open and send request
      xhr.open('POST', `${API_BASE}/api/videos/upload?projectId=${projectId}`);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.send(formData);
    });
  },

  update: (id: string, title: string) =>
    apiFetch<VideoSource>(`/api/videos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),

  delete: (id: string) => apiFetch(`/api/videos/${id}`, { method: 'DELETE' }),

  regenerateThumbnail: (id: string) =>
    apiFetch<VideoSource>(`/api/videos/${id}/thumbnail/regenerate`, {
      method: 'POST',
    }),
};
