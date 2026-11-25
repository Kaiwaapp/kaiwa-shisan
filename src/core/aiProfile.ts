// AIでプロフィールを自動入力(試作)。プロフィールの画面でボタンを押したときだけ読み込む。
// 材料は3通り: その人の記録 / 貼り付けた文章(マッチングアプリのプロフィールなど) / スクショ。
import { client, imageToBase64, record, textOf, wait } from './ai';
import { currentLang, t } from '../i18n';
import { cleanProfile, type PersonProfile } from './types';

/** 埋めてほしい項目(設定で決めた項目の並び) */
export interface FieldSpec { id: string; label: string }

export type ProfileSource =
  | { kind: 'records'; name: string; memo: string; texts: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'image'; image: Blob };

/** 初めからある項目は、AIに入力例も添える */
const FIELD_HELP: Record<string, string> = {
  age: '例: 28歳、20代後半',
  birthday: '例: 3月14日',
  area: '住んでいる地域。例: 東京・世田谷',
  hometown: '出身地',
  job: '仕事・職業',
  hobbies: '読点区切り',
  likes: '好きなもの・好きな食べ物など。読点区切り',
  dislikes: '苦手なもの・嫌いなもの。読点区切り',
  metAt: '知り合ったきっかけ・場所。例: マッチングアプリ、友人の紹介',
};

/** 記録は新しい順に、合計でこの文字数まで送る(料金を抑える) */
const MAX_CHARS = 12000;

export function recordsText(texts: string[]): string {
  const out: string[] = [];
  let n = 0;
  for (const x of texts) {
    const s = x.trim();
    if (!s) continue;
    if (n + s.length > MAX_CHARS) break;
    out.push(s);
    n += s.length;
  }
  return out.map((s, i) => `<memo i="${i + 1}">\n${s}\n</memo>`).join('\n');
}

export async function fillProfile(apiKey: string, src: ProfileSource, specs: FieldSpec[]): Promise<{ profile: PersonProfile; yen: number }> {
  // 項目IDは英数字なのでそのままJSONのキーにする
  const properties: Record<string, unknown> = {};
  for (const f of specs) properties[f.id] = { type: 'string' };
  properties.extra = {
    type: 'array',
    items: {
      type: 'object',
      properties: { label: { type: 'string' }, value: { type: 'string' } },
      required: ['label', 'value'],
      additionalProperties: false,
    },
  };
  const fields = specs.map((f) => `- ${f.id}: ${f.label}${FIELD_HELP[f.id] ? `(${FIELD_HELP[f.id]})` : ''}`).join('\n');
  const sourceRule =
    src.kind === 'records'
      ? '材料は、ユーザー(自分)がこの相手と話した内容のメモです。メモには自分のことも書かれているので、相手本人について分かることだけを使い、自分のことや第三者のことは入れないでください。'
      : '材料は、相手のプロフィール(マッチングアプリやSNSのプロフィール画面など)です。';
  const system =
    'あなたは連絡先のプロフィール整理係です。材料から、相手のプロフィールの各項目を短く埋めます。\n' +
    sourceRule + '\n' +
    '- 材料にはっきり書かれていることだけを使い、推測で埋めない。分からない項目は空文字にする。\n' +
    '- 値は短く(1項目40文字程度まで)。箇条書きや説明文にしない。\n' +
    '- 上の項目に当てはまらないが大事そうな情報(身長、血液型、家族、休日の過ごし方、お酒、タバコ、結婚観など)は extra に {label, value} で入れる。多くても6個まで。\n' +
    (currentLang() === 'en' ? '- 値は材料の言語のまま書き、extra の label は英語にする。\n' : '') +
    '\n項目:\n' + fields;

  let content: Parameters<ReturnType<typeof client>['messages']['create']>[0]['messages'][0]['content'];
  if (src.kind === 'image') {
    const img = await imageToBase64(src.image);
    content = [
      { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
      { type: 'text', text: 'このプロフィール画面から、各項目を埋めてください。' },
    ];
  } else if (src.kind === 'text') {
    content = `<profile>\n${src.text}\n</profile>`;
  } else {
    content =
      `相手の名前: ${src.name}\n` +
      (src.memo.trim() ? `相手についてのメモ:\n${src.memo}\n\n` : '') +
      `話した内容のメモ(新しい順):\n${recordsText(src.texts)}`;
  }

  const msg = await client(apiKey).messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 2000,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: { type: 'object', properties, required: [...specs.map((f) => f.id), 'extra'], additionalProperties: false },
      },
    },
    system,
    messages: [{ role: 'user', content }],
  });
  const raw = textOf(msg);
  const yen = record(msg.usage);
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw);
  } catch {
    throw new Error(t('AIの返事を読み取れませんでした。もう一度お試しください'));
  }
  const out: PersonProfile = { fields: {} };
  for (const f of specs) if (typeof j[f.id] === 'string') out.fields![f.id] = j[f.id] as string;
  if (Array.isArray(j.extra)) {
    out.extra = (j.extra as { label?: unknown; value?: unknown }[])
      .filter((x) => typeof x?.label === 'string' && typeof x?.value === 'string')
      .map((x) => ({ label: x.label as string, value: x.value as string }));
  }
  return { profile: cleanProfile(out) ?? {}, yen };
}

// ---- お試し表示(APIを呼ばない) ----

/** 「趣味: 映画」のような行の見出し → 初めからある項目 */
const LABELS: [RegExp, string][] = [
  [/^(年齢|age)$/i, 'age'],
  [/^(誕生日|birthday)$/i, 'birthday'],
  [/^(住まい|居住地|住んでいる(ところ|場所)?|エリア|居住エリア|location|lives? in)$/i, 'area'],
  [/^(出身|出身地|hometown)$/i, 'hometown'],
  [/^(仕事|職業|職種|job|work|occupation)$/i, 'job'],
  [/^(趣味|hobbies|hobby)$/i, 'hobbies'],
  [/^(好きなもの|好きな(こと|食べ物)|likes)$/i, 'likes'],
  [/^(苦手なもの|苦手|嫌いなもの|dislikes)$/i, 'dislikes'],
  [/^(知り合ったきっかけ|きっかけ|出会い|met)$/i, 'metAt'],
];

/** 文章の中の言い回し → 初めからある項目 */
const PHRASES: [RegExp, string][] = [
  [/(\d{2})\s*歳/, 'age'],
  [/誕生日は?([^\s。、,]{2,12})/, 'birthday'],
  [/([^\s。、,「」]{2,10})出身/, 'hometown'],
  [/([^\s。、,「」]{2,10})に住んで/, 'area'],
  [/仕事は([^。\n]{2,20}?)(?:で|。|$)/m, 'job'],
  [/趣味は([^。\n]{2,30}?)(?:で|。|$)/m, 'hobbies'],
  [/([^\s。、,「」]{2,12})が(?:大)?好き/, 'likes'],
  [/([^\s。、,「」]{2,12})が苦手/, 'dislikes'],
];

/** 「まなみさんは大阪」→「大阪」、「キャンプらしい」→「キャンプ」 */
const tidy = (x: string) => (x.split(/[はが]/).pop() ?? x).replace(/(らしい|みたい|です|だよ|だそう|とのこと)$/, '').trim();

const norm = (x: string) => x.normalize('NFKC').toLowerCase().trim();

/** お試し表示: APIを使わず、「見出し: 値」の行と決まった言い回しだけを拾う */
export function demoParse(text: string, specs: FieldSpec[]): PersonProfile {
  const ids = new Set(specs.map((f) => f.id));
  const fields: Record<string, string> = {};
  const extra: { label: string; value: string }[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([^:：]{1,12})\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    const byName = specs.find((f) => norm(f.label) === norm(label));
    const builtin = LABELS.find(([re]) => re.test(label))?.[1];
    const id = byName?.id ?? (builtin && ids.has(builtin) ? builtin : undefined);
    if (id) { if (!fields[id]) fields[id] = value; }
    else if (!/^(自分|私|me)$/i.test(label) && extra.length < 6 && value.length <= 40) extra.push({ label, value });
  }
  for (const [re, id] of PHRASES) {
    if (fields[id] || !ids.has(id)) continue;
    const m = text.match(re);
    if (m) fields[id] = id === 'age' ? `${m[1]}歳` : tidy(m[1]);
  }
  return cleanProfile({ fields, extra }) ?? {};
}

export async function demoFillProfile(src: ProfileSource, specs: FieldSpec[]): Promise<{ profile: PersonProfile; yen: number }> {
  await wait(600);
  if (src.kind === 'image') {
    const sample: Record<string, string> = {
      age: t('(お試し)28歳'),
      area: t('(お試し)東京'),
      job: t('(お試し)看護師'),
      hobbies: t('(お試し)カフェ巡り、映画'),
    };
    const fields: Record<string, string> = {};
    for (const f of specs) if (sample[f.id]) fields[f.id] = sample[f.id];
    return { profile: { fields, extra: [{ label: t('身長'), value: t('(お試し)160cm') }] }, yen: 0 };
  }
  const text = src.kind === 'text' ? src.text : [src.memo, ...src.texts].join('\n');
  return { profile: demoParse(text, specs), yen: 0 };
}
