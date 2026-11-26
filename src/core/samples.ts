// 初めて開いたときに入れておく見本(話題・人・タグ)。sample: true の印を付け、「見本を消す」でまとめて消せるようにする。
// 話題の内容は翻訳しない方針なので日本語のみ。
import { newId, today, type AppData, type Entry, type ID, type Person, type Topic } from './types';

const DAY = 86400000;

export function buildSamples(now = Date.now()): Pick<AppData, 'people' | 'topics' | 'entries'> {
  const person = (name: string, memo: string, reading: string, i: number, profile?: Person['profile']): Person => ({
    id: newId(), name, memo, reading, createdAt: now - 30 * DAY, updatedAt: now, viewedAt: now - i * 1000, selectedAt: now - i * 1000,
    folderId: null, ...(profile ? { profile } : {}), sample: true,
  });
  const people = [
    person('ゆいさん（見本）', 'マッチングアプリで知り合った。カフェ巡りが好き', 'ゆいさん', 1, { fields: { age: '27歳', area: '東京', job: 'デザイナー', hobbies: 'カフェ巡り、写真' } }),
    person('さきさん（見本）', '映画好き', 'さきさん', 2),
    person('はるかさん（見本）', '職場の同期', 'はるかさん', 3),
  ];
  const topic = (name: string, reading: string, i: number): Topic => ({
    id: newId(), name, reading, createdAt: now - 30 * DAY, updatedAt: now, viewedAt: now - i * 1000, selectedAt: now - i * 1000, folderId: null, sample: true,
  });
  const topics = [topic('旅行', 'りょこう', 1), topic('カフェ', 'かふぇ', 2), topic('映画', 'えいが', 3), topic('仕事', 'しごと', 4)];
  const [yui, saki, haruka] = people.map((p) => p.id);
  const [travel, cafe, movie, work] = topics.map((t) => t.id);
  let n = 0;
  const entry = (text: string, personIds: ID[], topicIds: ID[], daysAgo: number, title?: string): Entry => ({
    id: newId(), ...(title ? { title } : {}), text, personIds, topics: topicIds.map((topicId) => ({ topicId, source: 'manual' as const })),
    talkedOn: today(new Date(now - daysAgo * DAY)), folderId: null,
    createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY, viewedAt: now - ++n * 1000, sample: true,
  });
  const entries = [
    entry('これは見本の話題です。話したことを1件ずつ書き、話した相手とタグを付けておくと、あとで「人」や「タグ」から探せます。\n見本は設定や話題タブの案内から、まとめて消せます。', [], [], 0, '会話資産の使い方（見本）'),
    entry('去年の夏に一人で行った京都旅行。朝6時の伏見稲荷が誰もいなくて最高だった話。写真を見せたらかなりウケた', [yui, saki], [travel], 1),
    entry('最近ハマっている浅煎りのコーヒー。近所の焙煎所で豆を量り売りしてもらっている', [yui], [cafe], 2),
    entry('学生時代に映画サークルで自主制作した話。監督をやって大失敗したオチが鉄板', [saki], [movie], 3),
    entry('転職して半年。前の会社との違い（リモート中心・朝が遅い）', [yui, haruka], [work], 5),
  ];
  return { people, topics, entries };
}
