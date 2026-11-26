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
  // 「見本」タグはすべての見本に付け、タグタブから見本の一覧を開けるようにする
  const topics = [
    topic('見本', 'みほん', 0), topic('鉄板ネタ', 'てっぱんねた', 1), topic('旅行', 'りょこう', 2), topic('料理', 'りょうり', 3),
    topic('学生時代', 'がくせいじだい', 4), topic('健康', 'けんこう', 5), topic('仕事', 'しごと', 6),
  ];
  const [kenta, mother, sato, tanaka] = people.map((p) => p.id);
  const [sampleTag, classic, travel, cooking, school, health, work] = topics.map((t) => t.id);
  let n = 0;
  const entry = (title: string, text: string, memo: string, personIds: ID[], topicIds: ID[], daysAgo: number): Entry => ({
    id: newId(), title, text, ...(memo ? { memo } : {}), personIds, topics: [sampleTag, ...topicIds].map((topicId) => ({ topicId, source: 'manual' as const })),
    talkedOn: today(new Date(now - daysAgo * DAY)), folderId: null,
    createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY, viewedAt: now - ++n * 1000, sample: true,
  });
  // 本文 = 相手にそのまま話す文(使い回す部分)。メモ = いつ・誰に話したか、反応、使える場面などのシチュエーション
  const entries = [
    entry('会話資産の使い方（見本）',
      '本文には、相手にそのまま話す文だけを書きます。いつ・誰に話したか、相手の反応などはメモに書きます。',
      '話した相手を付けると、同じ人に同じ話をするのを防げます。タグを付けると「旅行の話ある？」と聞かれたときにすぐ探せます。見本には「#見本」タグが付いていて、設定からまとめて消せます。',
      [], [], 0),
    entry('朝6時の伏見稲荷を独り占めした話',
      '京都って朝6時が一番いいんですよ。去年の夏に早起きして伏見稲荷に行ったら、千本鳥居に誰もいなくて写真が撮り放題でした。で、9時に戻ってきたら観光客で大行列。早起きは三文以上の得でした。',
      '旅行の話になったときに。写真を見せると盛り上がる。けんた：行きたがっていた。佐藤さん：出張のついでに寄ると言っていた。次は田中さんに話す', [kenta, sato], [classic, travel], 2),
    entry('映画サークルで監督して大失敗した話',
      '学生時代に映画サークルで監督をやったことがあって。張り切って脚本も書いたんですけど、上映会で笑いが起きたのがシリアスな場面だけだったんです。',
      '自己紹介や「学生時代何してた？」と聞かれたときに。佐藤さん・田中さんには大ウケ。けんたは同じサークルなので話さない', [sato, tanaka], [classic, school], 4),
    entry('玉ねぎを40分炒めたスパイスカレー',
      'この前の週末、本気でスパイスカレーを作ってみたんです。玉ねぎを40分炒めたら、いつものカレーとは別物になりました。',
      '料理好きの人・一人暮らしの人と。母：作り方を聞かれたのでレシピを送る。けんた：今度作りに来ると言っていた', [mother, kenta], [cooking], 6),
    entry('朝ランを始めて変わったこと',
      '3か月前から朝ランを始めて、川沿いを30分走ってるんです。よく眠れるようになって、朝ごはんがおいしくなりました。',
      '健康・運動の話題になったときに。田中さん：おすすめのコースを聞かれた。母：無理しないでと言われた', [tanaka, mother], [health], 9),
    entry('新しいプロジェクトで学んだこと',
      'リーダーを任されて、最初に全員と1対1で話す時間を作ったんです。そうしたら、そのあと相談してもらえることがぐっと増えました。',
      '職場の人向け。友達には話しすぎない。佐藤さん：自分も同じことをしていると共感してくれた', [sato], [work], 12),
  ];
  return { people, topics, entries };
}
