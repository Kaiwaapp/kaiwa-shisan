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
  // 1回話してウケた話を「持ちネタ」として残し、別の人にも使い回す例。相手は「もう話した人」、メモは相手ごとの反応
  const entries = [
    entry('会話資産の使い方（見本）',
      '一度話してウケた話を「持ちネタ」として書いておくと、次に別の人と話すときに使い回せます。\n・話した相手を付けると、同じ人に同じ話をするのを防げます\n・タグを付けると「旅行の話ある？」と聞かれたときにすぐ探せます\n・メモに相手の反応を残すと、話す相手を選ぶ参考になります\n見本には「#見本」タグが付いていて、設定からまとめて消せます。',
      '', [], [], 0),
    entry('朝6時の伏見稲荷を独り占めした話',
      'つかみ：「京都は朝6時が一番いい」\n去年の夏、早起きして伏見稲荷へ。千本鳥居に誰もいなくて写真が撮り放題だった。\nオチ：9時に戻ったら観光客で大行列。早起きは三文以上の得。\n写真を見せると盛り上がる。',
      'けんた：行きたがっていた。佐藤さん：出張のついでに寄ると言っていた。次は田中さんに話す', [kenta, sato], [classic, travel], 2),
    entry('映画サークルで監督して大失敗した話',
      '学生時代、自主制作映画で監督をやった。張り切って脚本を書いたら、上映会で笑いが起きたのがシリアスな場面だけだった。\n自己紹介や「学生時代何してた？」で使える。',
      '佐藤さん・田中さんには大ウケ。けんたは同じサークルなので話さない', [sato, tanaka], [classic, school], 4),
    entry('玉ねぎを40分炒めたスパイスカレー',
      '週末に本気のスパイスカレーを作った。玉ねぎを40分炒めたら、いつものカレーとは別物になった。\n料理好きの人・一人暮らしの人と盛り上がる。',
      '母：作り方を聞かれたのでレシピを送る。けんた：今度作りに来ると言っていた', [mother, kenta], [cooking], 6),
    entry('朝ランを始めて変わったこと',
      '朝ランを始めて3か月。川沿いのコースを30分。よく眠れるようになり、朝ごはんがおいしい。\n健康・運動の話題になったときに使える。',
      '田中さん：おすすめのコースを聞かれた。母：無理しないでと言われた', [tanaka, mother], [health], 9),
    entry('新しいプロジェクトで学んだこと',
      'リーダーを任されて1か月。最初に全員と1対1で話す時間を作ったら、その後の相談がぐっと増えた。\n職場の人向け。友達には話しすぎない。',
      '佐藤さん：自分も同じことをしていると共感してくれた', [sato], [work], 12),
  ];
  return { people, topics, entries };
}
