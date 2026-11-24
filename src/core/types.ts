// データモデル。UIや保存先に依存しないので、将来Expo(React Native)へそのまま移せる。

export type ID = string;

export interface Person {
  id: ID;
  name: string;
  memo: string;
  createdAt: number;
  updatedAt: number;
  /** 最後に開いた日時(並べ替え用) */
  viewedAt?: number;
  /** 記録の相手・話題として最後に選んだ日時(候補の並び順用) */
  selectedAt?: number;
  /** 読み仮名(検索用) */
  reading?: string;
  /** 入っているフォルダ(人用・話題用)。null/未設定は一番上 */
  folderId?: ID | null;
  /** ピン留め(一覧の上に固定) */
  pinned?: boolean;
}

export interface Topic {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 最後に開いた日時(並べ替え用) */
  viewedAt?: number;
  /** 記録の相手・話題として最後に選んだ日時(候補の並び順用) */
  selectedAt?: number;
  /** 読み仮名(検索用) */
  reading?: string;
  /** 入っているフォルダ(人用・話題用)。null/未設定は一番上 */
  folderId?: ID | null;
  /** ピン留め(一覧の上に固定) */
  pinned?: boolean;
}

/** 話題タグの付け方。試作は manual のみ。将来の課金機能でAIが提案したものは 'ai'。 */
export type TagSource = 'manual' | 'ai';

export interface TopicTag {
  topicId: ID;
  source: TagSource;
}

/** 記録1件 = タイトル(任意) + 自由記述テキスト + 話した相手(複数) + 話題タグ */
export interface Entry {
  id: ID;
  /** タイトル(任意)。未設定なら一覧では本文の1行目を見出しに使う */
  title?: string;
  text: string;
  personIds: ID[];
  topics: TopicTag[];
  /** 話した日 (YYYY-MM-DD) */
  talkedOn: string;
  /** 入っているフォルダ。null は未分類 */
  folderId: ID | null;
  createdAt: number;
  updatedAt: number;
  /** 最後に開いた日時(並べ替え用) */
  viewedAt?: number;
  /** ピン留め(一覧の上に固定) */
  pinned?: boolean;
  /** 削除した日時。あるものは「最近削除した項目」にあり、30日で完全に消える */
  deletedAt?: number;
}

export type FolderScope = 'entry' | 'person' | 'topic';

export interface Folder {
  id: ID;
  name: string;
  /** 親フォルダ。null は一番上 */
  parentId: ID | null;
  /** 何を入れるフォルダか。未設定は記録用 */
  scope?: FolderScope;
  createdAt: number;
  updatedAt: number;
  /** 最後に開いた日時(並べ替え用) */
  viewedAt?: number;
}

export interface AppData {
  people: Person[];
  topics: Topic[];
  entries: Entry[];
  folders: Folder[];
}

export const newId = (): ID =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const today = (d = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 一覧などに出す見出し。タイトルがなければ本文の1行目(iPhoneのメモと同じ) */
export const entryLabel = (e: { title?: string; text: string }, max = 40): string =>
  (e.title?.trim() || e.text.trim().split('\n')[0]).slice(0, max);

/**
 * 一覧で2行に収めるための見出しと続き。
 * タイトルあり: 見出し=タイトル、続き=本文。タイトルなし: 見出し=本文の1行目、続き=2行目以降。
 * 続きは改行を空白にまとめて1行にする(はみ出しは画面側で「…」)。
 */
export const entryPreview = (e: { title?: string; text: string }): { head: string; rest: string } => {
  const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
  const title = e.title?.trim();
  if (title) return { head: title, rest: oneLine(e.text) };
  const lines = e.text.trim().split('\n');
  const i = lines.findIndex((l) => l.trim());
  if (i < 0) return { head: '', rest: '' };
  return { head: lines[i].trim(), rest: oneLine(lines.slice(i + 1).join('\n')) };
};
