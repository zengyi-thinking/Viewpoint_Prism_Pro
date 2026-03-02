import { apiFetch } from './api';
import {
  TrackEventDto,
  VideoSession,
  VideoBookmark,
  CreateBookmarkDto,
  UpdateBookmarkDto,
  VideoNote,
  CreateNoteDto,
  UpdateNoteDto,
  VideoHighlight,
  CreateHighlightDto,
  UpdateHighlightDto,
  VideoAnalytics,
  UserVideoProgress,
} from '@/types/video-behavior';

// Event Tracking
export const trackEvent = (data: TrackEventDto) =>
  apiFetch('/api/video-behavior/track', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const trackBulkEvents = (events: TrackEventDto[]) =>
  apiFetch('/api/video-behavior/track/bulk', {
    method: 'POST',
    body: JSON.stringify({ events }),
  });

// Sessions
export const getActiveSession = (videoId: string) =>
  apiFetch<VideoSession | null>(`/api/video-behavior/sessions/active?videoId=${videoId}`);

export const endSession = (sessionId: string, finalPosition: number) =>
  apiFetch<VideoSession>('/api/video-behavior/sessions/end', {
    method: 'POST',
    body: JSON.stringify({ sessionId, finalPosition }),
  });

export const listSessions = (videoId: string) =>
  apiFetch<VideoSession[]>(`/api/video-behavior/sessions?videoId=${videoId}`);

// Bookmarks
export const createBookmark = (data: CreateBookmarkDto) =>
  apiFetch<VideoBookmark>('/api/video-behavior/bookmarks', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const listBookmarks = (videoId: string) =>
  apiFetch<VideoBookmark[]>(`/api/video-behavior/bookmarks?videoId=${videoId}`);

export const updateBookmark = (id: string, data: UpdateBookmarkDto) =>
  apiFetch<VideoBookmark>(`/api/video-behavior/bookmarks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteBookmark = (id: string) =>
  apiFetch(`/api/video-behavior/bookmarks/${id}`, { method: 'DELETE' });

// Notes
export const createNote = (data: CreateNoteDto) =>
  apiFetch<VideoNote>('/api/video-behavior/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const listNotes = (videoId: string) =>
  apiFetch<VideoNote[]>(`/api/video-behavior/notes?videoId=${videoId}`);

export const updateNote = (id: string, data: UpdateNoteDto) =>
  apiFetch<VideoNote>(`/api/video-behavior/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteNote = (id: string) =>
  apiFetch(`/api/video-behavior/notes/${id}`, { method: 'DELETE' });

// Highlights
export const createHighlight = (data: CreateHighlightDto) =>
  apiFetch<VideoHighlight>('/api/video-behavior/highlights', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const listHighlights = (videoId: string) =>
  apiFetch<VideoHighlight[]>(`/api/video-behavior/highlights?videoId=${videoId}`);

export const getSharedHighlight = (token: string) =>
  apiFetch<VideoHighlight>(`/api/video-behavior/highlights/shared/${token}`);

export const updateHighlight = (id: string, data: UpdateHighlightDto) =>
  apiFetch<VideoHighlight>(`/api/video-behavior/highlights/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteHighlight = (id: string) =>
  apiFetch(`/api/video-behavior/highlights/${id}`, { method: 'DELETE' });

export const toggleHighlightShare = (id: string) =>
  apiFetch<VideoHighlight>(`/api/video-behavior/highlights/${id}/toggle-share`, {
    method: 'POST',
  });

// Analytics & Progress
export const getVideoAnalytics = (videoId: string) =>
  apiFetch<VideoAnalytics>(`/api/video-behavior/analytics?videoId=${videoId}`);

export const getUserVideoProgress = (videoId: string) =>
  apiFetch<UserVideoProgress>(`/api/video-behavior/progress?videoId=${videoId}`);

// Consolidated API object
export const videoBehaviorApi = {
  // Event Tracking
  trackEvent,
  trackBulkEvents,

  // Sessions
  getActiveSession,
  endSession,
  listSessions,

  // Bookmarks
  createBookmark,
  listBookmarks,
  updateBookmark,
  deleteBookmark,

  // Notes
  createNote,
  listNotes,
  updateNote,
  deleteNote,

  // Highlights
  createHighlight,
  listHighlights,
  getSharedHighlight,
  updateHighlight,
  deleteHighlight,
  toggleHighlightShare,

  // Analytics & Progress
  getVideoAnalytics,
  getUserVideoProgress,
};
