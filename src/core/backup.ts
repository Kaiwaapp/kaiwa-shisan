import type { AppData, Entry, EntryImage, Folder, Group, Person, Topic } from './types';

export const BACKUP_FORMAT = 'kaiwa-shisan-backup';
export const BACKUP_VERSION = 4;

/** バックアップの中の画像。JSONに入れるため中身はbase64 */
export interface BackupImage extends Omit<EntryImage, 'data'> {
  data: string;
}

export interface BackupFile extends AppData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** v4から。画像を含めずに書き出したときはない */
  images?: BackupImage[];
}

/** 画像つきのデータ(バックアップの読み書き用) */
export type BackupData = AppData & { images?: EntryImage[] };

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export const toBackup = (data: AppData, images?: EntryImage[]): BackupFile => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  people: data.people,
  topics: data.topics,
  entries: data.entries,
  folders: data.folders,
  groups: data.groups,
  ...(images ? { images: images.map((img) => ({ ...img, data: bufferToBase64(img.data) })) } : {}),
});

export function parseBackup(json: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('JSONとして読み込めませんでした');
  }
  const r = raw as Partial<BackupFile>;
  if (!r || r.format !== BACKUP_FORMAT) throw new Error('会話資産のバックアップファイルではありません');
  if (!Array.isArray(r.people) || !Array.isArray(r.topics) || !Array.isArray(r.entries))
    throw new Error('ファイルの中身が壊れています');
  return {
    people: r.people as Person[],
    topics: r.topics as Topic[],
    entries: (r.entries as Entry[]).map((e) => ({ ...e, folderId: e.folderId ?? null })),
    folders: Array.isArray(r.folders) ? (r.folders as Folder[]).map((f) => ({ ...f, parentId: f.parentId ?? null })) : [],
    // v2までのバックアップにはグループがない
    groups: Array.isArray(r.groups) ? (r.groups as Group[]) : [],
    // v3までのバックアップ・画像なしで書き出したものには画像がない
    images: Array.isArray(r.images)
      ? r.images.filter((i) => i && typeof i.id === 'string' && typeof i.data === 'string').map((i) => ({ ...i, data: base64ToBuffer(i.data) }))
      : [],
  };
}

/** 既存データにバックアップを統合。同じIDは更新日時が新しい方を残す */
export function mergeData(current: AppData, incoming: AppData): AppData {
  const merge = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b) {
      const cur = m.get(x.id);
      if (!cur || x.updatedAt > cur.updatedAt) m.set(x.id, x);
    }
    return [...m.values()];
  };
  return {
    people: merge(current.people, incoming.people),
    topics: merge(current.topics, incoming.topics),
    entries: merge(current.entries, incoming.entries),
    folders: merge(current.folders, incoming.folders),
    groups: merge(current.groups ?? [], incoming.groups ?? []),
  };
}
