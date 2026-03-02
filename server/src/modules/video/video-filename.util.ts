import * as path from 'path';

const CJK_REGEX = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

function hasCjk(text: string): boolean {
  return CJK_REGEX.test(text);
}

/**
 * Decode filename from potential latin1-mojibake into utf8.
 * Browsers/clients may send multipart filenames as byte sequences that end up
 * interpreted as latin1 on server side.
 */
export function decodeMojibakeUtf8(input: string): string {
  if (!input) return '';

  const normalized = String(input).trim();
  if (!normalized) return '';

  // If already contains CJK, treat it as already-correct.
  if (hasCjk(normalized)) {
    return normalized.normalize('NFC');
  }

  try {
    const decoded = Buffer.from(normalized, 'latin1').toString('utf8').trim();
    if (!decoded || decoded.includes('\uFFFD')) {
      return normalized.normalize('NFC');
    }

    // Decode only when the decoded result clearly looks better for East Asian names.
    if (hasCjk(decoded)) {
      return decoded.normalize('NFC');
    }
  } catch {
    // ignore and fallback to original
  }

  return normalized.normalize('NFC');
}

export function stripFileExtension(filename: string): string {
  if (!filename) return '';
  return filename.replace(/\.[^/.]+$/, '');
}

export function resolveVideoExtension(filename: string, mimeType?: string): string {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext) return ext;

  const type = String(mimeType || '').toLowerCase();
  if (type.includes('webm')) return '.webm';
  if (type.includes('ogg')) return '.ogg';
  if (type.includes('quicktime')) return '.mov';
  if (type.includes('x-msvideo')) return '.avi';
  if (type.includes('x-matroska')) return '.mkv';
  if (type.includes('x-flv')) return '.flv';
  if (type.includes('x-ms-wmv')) return '.wmv';
  return '.mp4';
}

