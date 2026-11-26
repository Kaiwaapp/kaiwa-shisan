import type { AppData, Entry, EntryImage, Folder, Group, ID, Person, Topic } from './types';

export const BACKUP_FORMAT = 'kaiwa-shisan-backup';
export const BACKUP_VERSION = 4;

/** バックアップの中の画像。JSONに入れるため中身はbase64 */
export interface BackupImage extends Omit<EntryImage, 'data'> {
  data: string;
}

/** full: 一括(全部)。incremental: 増分(前回の書き出しから変わったものだけ) */
export type BackupKind = 'full' | 'incremental';

const COLLECTIONS = ['people', 'topics', 'entries', 'folders', 'groups'] as const;
type Collection = (typeof COLLECTIONS)[number];
export type DeletedIds = Record<Collection, ID[]>;

export interface BackupFile extends AppData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /** 未設定は一括(v3までのファイル) */
  kind?: BackupKind;
  /** 増分: どの書き出しからの変更か(前回の書き出し日時)。null は前回がない */
  since?: string | null;
  /** 増分: 前回の書き出しの後に消したもののID */
  deleted?: DeletedIds;
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


export interface ParsedBackup {
  data: BackupData;
  kind: BackupKind;
  exportedAt: number;
  since: number | null;
  deleted: DeletedIds;
}

const emptyDeleted = (): DeletedIds => ({ people: [], topics: [], entries: [], folders: [], groups: [] });

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
  return readBackup(json).data;
}

/** バックアップファイル(一括・増分どちらも)を読む */
export function readBackup(json: string): ParsedBackup {
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
  const data: BackupData = {
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
  const deleted = emptyDeleted();
  if (r.kind === 'incremental' && r.deleted) {
    for (const c of COLLECTIONS) if (Array.isArray(r.deleted[c])) deleted[c] = r.deleted[c].filter((x) => typeof x === 'string');
  }
  const time = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);
  return {
    data,
    kind: r.kind === 'incremental' ? 'incremental' : 'full',
    exportedAt: time(r.exportedAt) ?? Date.now(),
    since: time(r.since),
    deleted,
  };
}

// ---- 増分エクスポート ----
/**
 * 書き出した時点の中身の控え。「種類:ID」→ 中身のハッシュ。
 * 次の増分はこれと比べて、増えた・変わった・消えたものだけを書き出す
 * (更新日時を変えない操作=ピン留め・お気に入り・並び順なども拾える)
 */
export interface ExportManifest { at: number; items: Record<string, string> }

/** 文字列の短いハッシュ(FNV-1a 32bit) */
const hash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

export function makeManifest(data: AppData, at = Date.now()): ExportManifest {
  const items: Record<string, string> = {};
  for (const c of COLLECTIONS) for (const x of data[c] ?? []) items[`${c}:${x.id}`] = hash(JSON.stringify(x));
  return { at, items };
}

/** 前回の書き出し(manifest)からの変更。manifest がなければ全部が変更扱い */
export function diffSince(data: AppData, manifest: ExportManifest | null): { changed: AppData; deleted: DeletedIds; count: number } {
  const prev = manifest?.items ?? {};
  const changed: AppData = { people: [], topics: [], entries: [], folders: [], groups: [] };
  const deleted = emptyDeleted();
  const seen = new Set<string>();
  let count = 0;
  for (const c of COLLECTIONS) {
    for (const x of data[c] ?? []) {
      const k = `${c}:${x.id}`;
      seen.add(k);
      if (prev[k] !== hash(JSON.stringify(x))) {
        (changed[c] as { id: ID }[]).push(x);
        count++;
      }
    }
  }
  for (const k of Object.keys(prev)) {
    if (seen.has(k)) continue;
    const i = k.indexOf(':');
    const c = k.slice(0, i) as Collection;
    if (deleted[c]) { deleted[c].push(k.slice(i + 1)); count++; }
  }
  return { changed, deleted, count };
}

/** images: 書き出す画像。変わった話題に付いている画像だけを入れる */
export const toIncremental = (data: AppData, manifest: ExportManifest | null, images?: EntryImage[]): BackupFile => {
  const { changed, deleted } = diffSince(data, manifest);
  const ids = new Set(changed.entries.flatMap((e) => e.imageIds ?? []));
  return {
    ...toBackup(changed, images?.filter((i) => ids.has(i.id))),
    kind: 'incremental',
    since: manifest ? new Date(manifest.at).toISOString() : null,
    deleted,
  };
};

/**
 * 増分ファイルを今のデータに反映する。変更は「同じか新しい更新日時」なら上書き
 * (ピン留めなど更新日時を変えない変更も反映するため)。
 * 削除は、このファイルの書き出しより後にこちらで編集したものは残す。話題は「最近削除した項目」へ移す
 */
export function applyIncremental(current: AppData, file: ParsedBackup, now = Date.now()): AppData {
  const put = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b) {
      const cur = m.get(x.id);
      if (!cur || x.updatedAt >= cur.updatedAt) m.set(x.id, x);
    }
    return [...m.values()];
  };
  const drop = <T extends { id: string; updatedAt: number }>(a: T[], ids: ID[]): T[] => {
    const s = new Set(ids);
    return a.filter((x) => !s.has(x.id) || x.updatedAt > file.exportedAt);
  };
  const del = new Set(file.deleted.entries);
  const entries = put(current.entries, file.data.entries).map((e) =>
    del.has(e.id) && !e.deletedAt && e.updatedAt <= file.exportedAt ? { ...e, deletedAt: now } : e,
  );
  return {
    people: drop(put(current.people, file.data.people), file.deleted.people),
    topics: drop(put(current.topics, file.data.topics), file.deleted.topics),
    entries,
    folders: drop(put(current.folders, file.data.folders), file.deleted.folders),
    groups: drop(put(current.groups ?? [], file.data.groups), file.deleted.groups),
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
