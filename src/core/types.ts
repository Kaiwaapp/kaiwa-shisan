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
}

/** 話題タグの付け方。試作は manual のみ。将来の課金機能でAIが提案したものは 'ai'。 */
export type TagSource = 'manual' | 'ai';

export interface TopicTag {
  topicId: ID;
  source: TagSource;
}

/** 記録1件 = 自由記述テキスト + 話した相手(複数) + 話題タグ */
export interface Entry {
  id: ID;
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
}

export interface Folder {
  id: ID;
  name: string;
  /** 親フォルダ。null は一番上 */
  parentId: ID | null;
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
