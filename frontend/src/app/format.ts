import { convertFileSrc } from '@tauri-apps/api/core';
import type { ImageRecord } from '../types';

export function thumbUrl(record: ImageRecord): string | null {
  if (!record.thumbnail_path) return null;
  // convertFileSrc yields the correct per-platform asset URL
  // (http://asset.localhost/... on Windows, asset://localhost/... elsewhere)
  // and percent-encodes the absolute path.
  try {
    return convertFileSrc(record.thumbnail_path);
  } catch {
    return null;
  }
}

export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return convertFileSrc(path);
  } catch {
    return null;
  }
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}