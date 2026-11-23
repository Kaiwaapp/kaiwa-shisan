import type { AppData, Entry } from './types';

/** 全角半角・大文字小文字・カタカナ/ひらがなの違いを吸収 */
export const normalize = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** スペース区切りの全語を、本文・人の名前・話題名のどこかに含む記録を返す */
export function searchEntries(data: AppData, query: string): Entry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const sorted = sortEntries(data.entries);
  if (words.length === 0) return sorted;
  const pName = new Map(data.people.map((p) => [p.id, p.name]));
  const tName = new Map(data.topics.map((t) => [t.id, t.name]));
  return sorted.filter((e) => {
    const hay = normalize(
      [
        e.text,
        ...e.personIds.map((id) => pName.get(id) ?? ''),
        ...e.topics.map((t) => tName.get(t.topicId) ?? ''),
      ].join('\n'),
    );
    return words.every((w) => hay.includes(w));
  });
}

/** 新しい順(話した日→作成日時) */
export const sortEntries = (entries: Entry[]): Entry[] =>
  [...entries].sort(
    (a, b) => b.talkedOn.localeCompare(a.talkedOn) || b.createdAt - a.createdAt,
  );
