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
  /** お気に入り(☆でワンタップ。お気に入り一覧に出る) */
  favorite?: boolean;
  /** 入っているグループ(複数可)。フォルダは1か所だけだが、グループはいくつでも */
  groupIds?: ID[];
  /** プロフィール(年齢・仕事・趣味など)。空の項目は持たない */
  profile?: PersonProfile;
  /** 手動の並び順(小さいほど上)。未設定は -createdAt 扱い(新しいものが上) */
  order?: number;
}

/** 初めから用意しているプロフィール項目。表示名は画面側(ui/profileFields.ts)で付け、設定で変えられる */
export const PROFILE_KEYS = ['age', 'birthday', 'area', 'hometown', 'job', 'hobbies', 'likes', 'dislikes', 'metAt'] as const;

/** この人だけに足した項目(身長・血液型など) */
export interface ProfileExtra {
  label: string;
  value: string;
}

/** プロフィールの中身。fields は項目ID(age や 自分で足した項目のID) → 値 */
export interface PersonProfile {
  fields?: Record<string, string>;
  extra?: ProfileExtra[];
}

/** 空の項目を取り除く。何も残らなければ undefined */
export function cleanProfile(p: PersonProfile | undefined): PersonProfile | undefined {
  if (!p) return undefined;
  const out: PersonProfile = {};
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.fields ?? {})) if (typeof v === 'string' && v.trim()) fields[k] = v.trim();
  if (Object.keys(fields).length) out.fields = fields;
  const extra = (p.extra ?? [])
    .map((x) => ({ label: x.label.trim(), value: x.value.trim() }))
    .filter((x) => x.label || x.value);
  if (extra.length) out.extra = extra;
  return Object.keys(out).length ? out : undefined;
}

export const hasProfile = (p: PersonProfile | undefined) => !!cleanProfile(p);

/** 検索用に、プロフィールの値を全部並べる */
export const profileValues = (p: PersonProfile | undefined): string[] =>
  p ? [...Object.values(p.fields ?? {}), ...(p.extra ?? []).map((e) => e.value)] : [];

/** 2人をまとめるとき。dst を優先し、dst が空の項目だけ src で埋める。この人だけの項目は両方残す */
export function mergeProfiles(dst: PersonProfile | undefined, src: PersonProfile | undefined): PersonProfile | undefined {
  const a = cleanProfile(dst) ?? {};
  const b = cleanProfile(src) ?? {};
  const fields = { ...(b.fields ?? {}), ...(a.fields ?? {}) };
  const seen = new Set((a.extra ?? []).map((x) => x.label + '\u0000' + x.value));
  const extra = [...(a.extra ?? []), ...(b.extra ?? []).filter((x) => !seen.has(x.label + '\u0000' + x.value))];
  return cleanProfile({ fields, extra });
}

export interface Group {
  id: ID;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 記録の相手として最後に選んだ日時(候補の並び順用) */
  selectedAt?: number;
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
  /** お気に入り(☆でワンタップ。お気に入り一覧に出る) */
  favorite?: boolean;
  /** 手動の並び順(小さいほど上)。未設定は -createdAt 扱い */
  order?: number;
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
  /** メモ(任意)。本文とは別の覚え書き(相手の反応など) */
  memo?: string;
  personIds: ID[];
  /** 話したグループ(グループ自体を相手として付ける。メンバーには展開しない) */
  groupIds?: ID[];
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
  /** お気に入り(☆でワンタップ。お気に入り一覧に出る) */
  favorite?: boolean;
  /** 削除した日時。あるものは「最近削除した項目」にあり、30日で完全に消える */
  deletedAt?: number;
  /** 添付した画像(EntryImage の id、並び順どおり)。画像そのものは別の保存場所に置く */
  imageIds?: ID[];
  /** 手動の並び順(小さいほど上)。未設定は -createdAt 扱い */
  order?: number;
}

/**
 * 記録に添付した画像。一覧の読み込みを軽くするため、記録とは別の保存場所に置き、開いたときだけ読む。
 * 端末の中だけに保存する(縮小・JPEG圧縮したもの)
 */
export interface EntryImage {
  id: ID;
  /** MIMEタイプ(通常 image/jpeg) */
  type: string;
  data: ArrayBuffer;
  width: number;
  height: number;
  createdAt: number;
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
  /** 手動の並び順(小さいほど上)。未設定は -createdAt 扱い */
  order?: number;
}

export interface AppData {
  people: Person[];
  topics: Topic[];
  entries: Entry[];
  folders: Folder[];
  groups: Group[];
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

/** その記録の相手に入っている人か(直接、またはグループのメンバーとして) */
export const entryHasPerson = (e: Pick<Entry, 'personIds' | 'groupIds'>, p: Pick<Person, 'id' | 'groupIds'>): boolean =>
  e.personIds.includes(p.id) || !!e.groupIds?.some((g) => p.groupIds?.includes(g));
