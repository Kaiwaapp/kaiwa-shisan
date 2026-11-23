import type { AppData, Entry, Folder, Person, Topic } from './types';

export const BACKUP_FORMAT = 'kaiwa-shisan-backup';
export const BACKUP_VERSION = 2;

export interface BackupFile extends AppData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
}

export const toBackup = (data: AppData): BackupFile => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  people: data.people,
  topics: data.topics,
  entries: data.entries,
  folders: data.folders,
});

export function parseBackup(json: string): AppData {
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
  };
}
