// AI機能(試作)。スクショの文字起こしと、話題・相手の自動提案。
// 試作では、ユーザー自身のAPIキーを端末内に保存し、ブラウザから直接 Claude API を呼ぶ。
// 将来の課金版では、この関数の中身をサーバー経由の呼び出しに差し替える想定。
import Anthropic from '@anthropic-ai/sdk';

export const AI_MODEL = 'claude-haiku-5-5';
// 料金(USD / 100万トークン)と、目安の為替(円/USD)。表示用の概算
const PRICE_IN = 0.1;
const PRICE_OUT = 0.5;
const YEN_PER_USD = 150;

export interface AiSettings {
  /** AI機能全体のON/OFF。ONならキーがなくてもボタン等が出る(キーなしはお試し表示) */
  enabled: boolean;
  apiKey: string;
  /** スクショ文字起こし */
  ocr: boolean;
  /** 話題・相手の自動提案 */
  suggest: boolean;
  /** これまでに使った金額の概算(円) */
  spentYen: number;
}

const KEY = 'kaiwa.ai.v1';
const DEFAULTS: AiSettings = { enabled: false, apiKey: '', ocr: true, suggest: true, spentYen: 0 };

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できない環境(プライベートモード等)では無視 */
  }
  listeners.forEach((f) => f(s));
}

const listeners = new Set<(s: AiSettings) => void>();
export function onAiSettings(f: (s: AiSettings) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export const ocrReady = (s: AiSettings) => s.enabled && s.ocr;
export const suggestReady = (s: AiSettings) => s.enabled && s.suggest;
/** APIキーがないときは、APIを呼ばずにお試しの結果を返す */
export const isDemo = (s: AiSettings) => !s.apiKey.trim();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** お試し表示: スクショ文字起こしのサンプル */
export async function demoTranscribe(): Promise<{ text: string; yen: number }> {
  await wait(700);
  return {
    text: '(お試し表示: APIキーを入れると、ここに画像の文字起こしが入ります)\n田中: 来月、京都に紅葉を見に行くんだ\n自分: いいね、おすすめのお寺を教えるよ',
    yen: 0,
  };
}

/** お試し表示: APIを使わず、本文から既存の名前・カタカナ語・「名前: 」の話者を拾うだけの簡易提案 */
export async function demoSuggest(text: string, known: { people: string[]; topics: string[] }): Promise<Suggestion & { yen: number }> {
  await wait(500);
  const n = (x: string) => x.normalize('NFKC').toLowerCase();
  const body = n(text);
  const people = known.people.filter((p) => p.trim() && body.includes(n(p)));
  for (const m of text.matchAll(/^\s*([^\s:：]{1,10})[:：]/gm)) {
    if (!/^(自分|私|わたし|僕|俺)$/.test(m[1]) && !people.includes(m[1])) people.push(m[1]);
  }
  const topics = known.topics.filter((t) => t.trim() && body.includes(n(t)));
  for (const m of text.matchAll(/[ァ-ヴー]{3,}/g)) if (topics.length < 4 && !topics.includes(m[0])) topics.push(m[0]);
  if (!topics.length) topics.push('雑談');
  return { topics: topics.slice(0, 4), people: people.slice(0, 4), yen: 0 };
}

function client(apiKey: string) {
  // ブラウザから直接呼ぶ(キーはこの端末の中だけ)。公開サービスにする時はサーバー経由にする
  return new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });
}

/** 1回の呼び出しの料金(円)を足し込み、その回の金額を返す */
function record(usage: { input_tokens: number; output_tokens: number }): number {
  const yen = ((usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT) / 1e6) * YEN_PER_USD;
  const s = loadAiSettings();
  saveAiSettings({ ...s, spentYen: s.spentYen + yen });
  return yen;
}

function textOf(msg: Anthropic.Message): string {
  if (msg.stop_reason === 'refusal') throw new Error('AIがこの内容の処理を断りました');
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'APIキーが正しくないようです。設定を確認してください';
  if (e instanceof Anthropic.PermissionDeniedError) return 'このAPIキーでは使えません(権限がありません)';
  if (e instanceof Anthropic.RateLimitError) return '短時間に使いすぎました。少し待ってからもう一度お試しください';
  if (e instanceof Anthropic.BadRequestError) {
    const m = e.message || '';
    if (/credit|balance/i.test(m)) return 'APIのクレジット残高が足りません。Claude Consoleでチャージしてください';
    return 'リクエストが受け付けられませんでした: ' + m;
  }
  if (e instanceof Anthropic.APIConnectionError) return '通信できませんでした。電波を確認してください';
  if (e instanceof Anthropic.APIError) return 'AIの呼び出しに失敗しました(' + (e.status ?? '?') + ')';
  return (e as Error)?.message || 'AIの呼び出しに失敗しました';
}

/** 画像を長辺1568pxまでに縮めてJPEGのbase64にする(料金と通信量を抑える) */
export async function imageToBase64(file: Blob, maxSide = 1568): Promise<{ data: string; mediaType: 'image/jpeg' }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { data: url.slice(url.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

/** スクショの文字起こし。会話の画面なら「話者: 発言」の形にする */
export async function transcribeImage(apiKey: string, image: Blob): Promise<{ text: string; yen: number }> {
  const img = await imageToBase64(image);
  const msg = await client(apiKey).messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system:
      'あなたは画像の文字起こし係です。画像に写っている文章をそのまま日本語のテキストにしてください。' +
      'チャットやSNSの画面なら、発言ごとに1行で「名前: 発言」の形にしてください(自分側の発言は「自分: 」)。' +
      '時刻・既読・ボタン・電波表示などの画面の飾りは省いてください。説明や前置きは書かず、文字起こしした本文だけを出力してください。',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
          { type: 'text', text: 'この画像を文字起こししてください。' },
        ],
      },
    ],
  });
  const text = textOf(msg);
  return { text, yen: record(msg.usage) };
}

export interface Suggestion {
  topics: string[];
  people: string[];
}

/** 本文から話題タグと話した相手を提案する。既存の名前があればそれを優先して使う */
export async function suggestTags(
  apiKey: string,
  text: string,
  known: { people: string[]; topics: string[] },
): Promise<Suggestion & { yen: number }> {
  const list = (xs: string[]) => (xs.length ? xs.slice(0, 300).join('、') : '(まだありません)');
  const msg = await client(apiKey).messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            topics: { type: 'array', items: { type: 'string' } },
            people: { type: 'array', items: { type: 'string' } },
          },
          required: ['topics', 'people'],
          additionalProperties: false,
        },
      },
    },
    system:
      'あなたは会話メモの整理係です。ユーザーが誰かと話した内容のメモを読み、あとで「この話を別の人にもしよう」と探しやすくなる話題タグと、話した相手を提案します。\n' +
      '- topics: 話題タグを1〜4個。短い名詞(例: 旅行、転職、子育て、キャンプ)。既存の話題に合うものがあれば、その名前をそのまま使う。\n' +
      '- people: メモから話した相手だとはっきり分かる人だけ。既存の人に合う人がいれば、その名前をそのまま使う。自分自身や、話の中に出てくるだけの第三者は入れない。分からなければ空にする。',
    messages: [
      {
        role: 'user',
        content:
          `既存の話題: ${list(known.topics)}\n既存の人: ${list(known.people)}\n\n` +
          `<memo>\n${text}\n</memo>`,
      },
    ],
  });
  const raw = textOf(msg);
  let parsed: Suggestion = { topics: [], people: [] };
  try {
    const j = JSON.parse(raw);
    parsed = {
      topics: Array.isArray(j.topics) ? j.topics.filter((x: unknown) => typeof x === 'string') : [],
      people: Array.isArray(j.people) ? j.people.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch {
    throw new Error('AIの返事を読み取れませんでした。もう一度お試しください');
  }
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim().replace(/^#/, '')).filter(Boolean))];
  return { topics: clean(parsed.topics), people: clean(parsed.people), yen: record(msg.usage) };
}

/** キーが使えるかを確かめる(ごく短い呼び出し) */
export async function testApiKey(apiKey: string): Promise<void> {
  const msg = await client(apiKey).messages.create({
    model: AI_MODEL,
    max_tokens: 16,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'OKとだけ返してください' }],
  });
  record(msg.usage);
}
