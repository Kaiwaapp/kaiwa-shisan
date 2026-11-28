import { profileValues, type AppData, type Entry, type PersonProfile } from './types';

/** 全角半角・大文字小文字・カタカナ/ひらがなの違いを吸収 */
export const normalize = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 名前・読み仮名で探す。人はプロフィール(仕事・趣味など)でも引っかかる */
export const nameMatches = (x: { name: string; reading?: string; profile?: PersonProfile }, q: string): boolean => {
  const n = normalize(q.trim().replace(/^#/, ''));
  if (!n) return true;
  if (normalize(x.name).includes(n) || normalize(x.reading ?? '').includes(n)) return true;
  return profileValues(x.profile).some((v) => normalize(v).includes(n));
};

/**
 * 話題ごとの検索用文字列(正規化済み)。打つたびに全件を作り直すと件数が多い時に重いので使い回す。
 * 話題・人・タグ・グループが変わると別のオブジェクト(配列)になるので、それを見て作り直す
 */
const hayCache = new WeakMap<Entry, { p: unknown; t: unknown; g: unknown; hay: string }>();

/** スペース区切りの全語を、タイトル・本文・メモ・人の名前・タグ名のどこかに含む話題を返す */
export function searchEntries(data: AppData, query: string): Entry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return sortEntries(data.entries);
  let names: { p: Map<string, string>; t: Map<string, string>; g: Map<string, string> } | null = null;
  const hayOf = (e: Entry): string => {
    const c = hayCache.get(e);
    if (c && c.p === data.people && c.t === data.topics && c.g === data.groups) return c.hay;
    names ??= {
      p: new Map(data.people.map((p) => [p.id, `${p.name} ${p.reading ?? ''}`])),
      t: new Map(data.topics.map((t) => [t.id, `${t.name} ${t.reading ?? ''}`])),
      g: new Map((data.groups ?? []).map((g) => [g.id, g.name])),
    };
    const n = names;
    const hay = normalize(
      [
        e.title ?? '',
        e.text,
        e.memo ?? '',
        ...e.personIds.map((id) => n.p.get(id) ?? ''),
        ...(e.groupIds ?? []).map((id) => n.g.get(id) ?? ''),
        ...e.topics.map((t) => n.t.get(t.topicId) ?? ''),
      ].join('\n'),
    );
    hayCache.set(e, { p: data.people, t: data.topics, g: data.groups, hay });
    return hay;
  };
  return sortEntries(data.entries.filter((e) => { const hay = hayOf(e); return words.every((w) => hay.includes(w)); }));
}

/** 新しい順(話した日→作成日時) */
export const sortEntries = (entries: Entry[]): Entry[] =>
  [...entries].sort(
    (a, b) => b.talkedOn.localeCompare(a.talkedOn) || b.createdAt - a.createdAt,
  );

// ---- 並べ替え ----
/** 開いた日時。まだ開いていなければ作成・編集した日時 */
export const lastSeen = (x: { viewedAt?: number; updatedAt: number }) => Math.max(x.viewedAt ?? 0, x.updatedAt);

// ---- 手動の並び順 ----
type Orderable = { id: string; createdAt: number; order?: number };
/** 手動の並び順の値。まだ並べ替えていないものは新しいほど上(-作成日時) */
export const manualKey = (x: Orderable): number => x.order ?? -x.createdAt;
export const byManual = (a: Orderable, b: Orderable) => manualKey(a) - manualKey(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** ids の中で dragId を targetId の前(after なら後ろ)へ動かした並びを返す。dragId がなければ足す */
export function moveInList(ids: string[], dragId: string, targetId: string, after: boolean): string[] {
  const l = ids.filter((x) => x !== dragId);
  const i = l.indexOf(targetId);
  if (i < 0) return ids;
  l.splice(after ? i + 1 : i, 0, dragId);
  return l;
}

/**
 * 新しい並び arranged に合わせて order を振り直す。並べ替えた項目がもともと使っていた値を
 * 小さい順に配り直すので、この一覧に出ていない項目との前後関係は変わらない
 * (フォルダの中で並べ替えても「すべての話題」での位置が大きく崩れない)
 */
export function reorderValues(items: Orderable[], arranged: string[]): Map<string, number> {
  const byId = new Map(items.map((x) => [x.id, x]));
  const list = arranged.map((id) => byId.get(id)).filter((x): x is Orderable => !!x);
  const slots = list.map(manualKey).sort((a, b) => a - b);
  // 同じ値が重なると順番が決まらないので、少しずつずらす
  for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 0.001;
  return new Map(list.map((x, i) => [x.id, slots[i]]));
}

export type EntrySort = 'manual' | 'viewed' | 'newest' | 'oldest' | 'updated';
export const ENTRY_SORTS: { key: EntrySort; label: string }[] = [
  { key: 'manual', label: '手動（長押しで並べ替え）' },
  { key: 'viewed', label: '最後に見た順' },
  { key: 'newest', label: '話した日が新しい順' },
  { key: 'oldest', label: '話した日が古い順' },
  { key: 'updated', label: '最近編集した順' },
];

export function sortEntriesBy(entries: Entry[], mode: EntrySort): Entry[] {
  const l = [...entries];
  if (mode === 'oldest') return l.sort((a, b) => a.talkedOn.localeCompare(b.talkedOn) || a.createdAt - b.createdAt);
  if (mode === 'updated') return l.sort((a, b) => b.updatedAt - a.updatedAt);
  if (mode === 'viewed') return l.sort((a, b) => lastSeen(b) - lastSeen(a));
  if (mode === 'manual') return l.sort(byManual);
  return sortEntries(l);
}

export type NameSort = 'manual' | 'viewed' | 'last' | 'first' | 'count' | 'name';
export const NAME_SORTS: { key: NameSort; label: string }[] = [
  { key: 'manual', label: '手動（長押しで並べ替え）' },
  { key: 'viewed', label: '最後に見た順' },
  { key: 'last', label: '最後に話した順' },
  { key: 'first', label: '最初に話した順' },
  { key: 'count', label: '話した回数順' },
  { key: 'name', label: '名前順' },
];

export interface NameStat { count: number; first: string; last: string }

/** 人またはタグごとの 話題数・最初/最後に話した日 */
export function statsBy(data: AppData, key: 'person' | 'topic'): Map<string, NameStat> {
  const m = new Map<string, NameStat>();
  // グループに話した話題は、そのグループの人みんなに話したものとして数える
  const members = new Map<string, string[]>();
  if (key === 'person') for (const p of data.people) for (const g of p.groupIds ?? []) members.set(g, [...(members.get(g) ?? []), p.id]);
  for (const e of data.entries) {
    const ids = key === 'person'
      ? [...new Set([...e.personIds, ...(e.groupIds ?? []).flatMap((g) => members.get(g) ?? []).filter((id) => !e.excludedPersonIds?.includes(id))])]
      : e.topics.map((t) => t.topicId);
    for (const id of ids) {
      const s = m.get(id) ?? { count: 0, first: '', last: '' };
      s.count++;
      if (e.talkedOn > s.last) s.last = e.talkedOn;
      if (!s.first || e.talkedOn < s.first) s.first = e.talkedOn;
      m.set(id, s);
    }
  }
  return m;
}

export function sortNames<T extends { id: string; name: string; createdAt: number; updatedAt: number; viewedAt?: number; order?: number; stat: NameStat }>(items: T[], mode: NameSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'ja');
  const l = [...items];
  switch (mode) {
    case 'manual':
      return l.sort(byManual);
    case 'viewed':
      return l.sort((a, b) => lastSeen(b) - lastSeen(a));
    case 'name':
      return l.sort(byName);
    case 'count':
      return l.sort((a, b) => b.stat.count - a.stat.count || byName(a, b));
    case 'first':
      // まだ話題がないものは最後
      return l.sort((a, b) => (a.stat.first || '9999').localeCompare(b.stat.first || '9999') || a.createdAt - b.createdAt);
    default:
      return l.sort((a, b) => b.stat.last.localeCompare(a.stat.last) || b.createdAt - a.createdAt);
  }
}
