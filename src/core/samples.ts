// 初めて開いたときに入れておく見本(話題・人・タグ)。sample: true の印を付け、「見本を消す」でまとめて消せるようにする。
// 話題の内容は翻訳しない方針なので日本語のみ。
import { newId, today, type AppData, type Entry, type ID, type Person, type Topic } from './types';

const DAY = 86400000;

export function buildSamples(now = Date.now()): Pick<AppData, 'people' | 'topics' | 'entries'> {
  const person = (name: string, memo: string, reading: string, relation: string, i: number, profile?: Person['profile']): Person => ({
    id: newId(), name, memo, reading, relation, createdAt: now - 30 * DAY, updatedAt: now, viewedAt: now - i * 1000, selectedAt: now - i * 1000,
    folderId: null, ...(profile ? { profile } : {}), sample: true,
  });
  // いろいろな関係の人を用意する(友達・家族・職場・知人)
  const people = [
    person('けんた（見本）', '大学のサークル仲間。年に数回飲みに行く', 'けんた', 'friend', 1, { fields: { job: 'エンジニア', hobbies: 'キャンプ、映画' } }),
    person('母（見本）', '週末によく電話する', 'はは', 'family', 2),
    person('佐藤さん（見本）', '職場の先輩。ランチによく行く', 'さとうさん', 'work', 3),
    person('ジムの田中さん（見本）', 'ジムでよく会う人', 'じむのたなかさん', 'acquaintance', 4),
  ];
  const topic = (name: string, reading: string, i: number): Topic => ({
    id: newId(), name, reading, createdAt: now - 30 * DAY, updatedAt: now, viewedAt: now - i * 1000, selectedAt: now - i * 1000, folderId: null, sample: true,
  });
  const topics = [topic('旅行', 'りょこう', 1), topic('料理', 'りょうり', 2), topic('映画', 'えいが', 3), topic('仕事', 'しごと', 4), topic('健康', 'けんこう', 5)];
  const [kenta, mother, sato, tanaka] = people.map((p) => p.id);
  const [travel, cooking, movie, work, health] = topics.map((t) => t.id);
  let n = 0;
  const entry = (text: string, personIds: ID[], topicIds: ID[], daysAgo: number, title?: string): Entry => ({
    id: newId(), ...(title ? { title } : {}), text, personIds, topics: topicIds.map((topicId) => ({ topicId, source: 'manual' as const })),
    talkedOn: today(new Date(now - daysAgo * DAY)), folderId: null,
    createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY, viewedAt: now - ++n * 1000, sample: true,
  });
  const entries = [
    entry('これは見本の話題です。話したことを1件ずつ書き、話した相手とタグを付けておくと、あとで「人」や「タグ」から探せます。\n見本は設定や話題タブの案内から、まとめて消せます。', [], [], 0, '会話資産の使い方（見本）'),
    entry('去年の夏に一人で行った京都旅行。朝6時の伏見稲荷が誰もいなくて最高だった話。写真を見せたらかなりウケた', [kenta, sato], [travel], 1),
    entry('週末に作ったスパイスカレー。玉ねぎを40分炒めたら別物の味になった', [mother, kenta], [cooking], 2),
    entry('最近観た映画の話。ラスト10分のどんでん返しは、観ていない人にはネタバレ注意', [kenta], [movie], 3),
    entry('新しいプロジェクトのリーダーを任された。最初の1か月で学んだこと', [sato, mother], [work], 5),
    entry('朝ランを始めて3か月。川沿いのコースが気持ちいいし、よく眠れるようになった', [tanaka, mother], [health], 6),
  ];
  return { people, topics, entries };
}
