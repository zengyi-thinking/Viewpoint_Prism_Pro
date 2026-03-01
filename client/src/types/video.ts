export interface VideoSource {
  id: string;
  title: string;
  sourceType: 'LOCAL_UPLOAD' | 'URL_IMPORT' | 'YOUTUBE' | 'BILIBILI';
  duration?: number;
  thumbnailUrl?: string;
}
