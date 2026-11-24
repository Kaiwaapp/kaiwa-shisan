// 他のアプリ(メモ帳・LINE・ChatGPT)から記録を取り込むための読み取り処理。
// UIやReactに依存しない純粋な関数だけにして、取り込み画面を開いたときだけ読み込まれるようにする。

import { today } from './types';

/** 取り込む前の記録1件(プレビューで直せる) */
export interface ImportDraft {
  /** プレビュー内での識別用 */
  key: string;
  include: boolean;
  title: string;
  text: string;
  talkedOn: string;
  /** 話した相手の名前(保存時に既存の人と照合し、なければ作る) */
  people: string[];
  /** 話題の名前(AIの提案など) */
  topics: string[];
}

export type TextSplit = 'blank' | 'marker' | 'none';

const DATE_RE = /^\s*(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})日?/;

/** 「2024/1/5」「2024年1月5日」「2024-01-05」などを YYYY-MM-DD に */
export function findDate(s: string): string | null {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const MARKER_RE = /^\s*(={3,}|-{3,}|＝{3,}|ー{3,}|_{3,})\s*$/;

/**
 * メモ帳・テキストを1件ずつに分ける。
 * - blank: 空行で区切る(空行が続いても1回)
 * - marker: ===、---(3文字以上)だけの行で区切る。iPhoneのショートカットで書き出したとき用
 * - none: 全部で1件
 */
export function splitText(raw: string, mode: TextSplit): string[] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  let chunks: string[];
  if (mode === 'none') chunks = [text];
  else if (mode === 'marker') {
    chunks = [];
    let cur: string[] = [];
    for (const line of text.split('\n')) {
      if (MARKER_RE.test(line)) { chunks.push(cur.join('\n')); cur = []; }
      else cur.push(line);
    }
    chunks.push(cur.join('\n'));
  } else chunks = text.split(/\n[ \t　]*\n+/);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

/** よくある区切りを自動で選ぶ(===などがあればそれ、なければ空行) */
export const guessSplit = (raw: string): TextSplit =>
  raw.split(/\r?\n/).some((l) => MARKER_RE.test(l)) ? 'marker' : 'blank';

/** 1かたまりのテキストを記録の下書きにする。先頭行が日付だけならそれを話した日にする */
export function textToDrafts(raw: string, mode: TextSplit, people: string[] = []): ImportDraft[] {
  return splitText(raw, mode).map((chunk, i) => {
    let lines = chunk.split('\n');
    let talkedOn = today();
    const d = findDate(lines[0]);
    if (d && lines[0].replace(DATE_RE, '').replace(/[()（）月火水木金土日曜\s]/g, '') === '' && lines.length > 1) {
      talkedOn = d;
      lines = lines.slice(1);
    }
    const text = lines.join('\n').trim();
    return { key: `t${i}`, include: true, title: '', text, talkedOn, people: [...people], topics: [] };
  });
}

// ---- LINE ----

export interface LineMessage {
  date: string;
  time: string;
  sender: string;
  text: string;
}

export interface LineChat {
  /** 「〇〇とのトーク履歴」の〇〇(1対1なら相手、グループならグループ名) */
  title: string;
  messages: LineMessage[];
  /** 発言した人(発言の多い順) */
  senders: string[];
}

// 2024/01/10(水) / 2024.01.10 水曜日 / 2024/1/10 Wed
const LINE_DAY_RE = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:\s*[(（]?[^\t]{0,4}[)）]?|\s+\S+曜日)?\s*$/;
// 12:34\t名前\t本文  (iOS/Android共通。古い形式は半角スペース区切り、午前/午後付き)
const LINE_MSG_RE = /^((?:午前|午後)?\d{1,2}:\d{2})\t([^\t]+)\t(.*)$/;
const LINE_SYS_RE = /^((?:午前|午後)?\d{1,2}:\d{2})\t[^\t]*$/;
const LINE_MSG_SPACE_RE = /^((?:午前|午後)?\d{1,2}:\d{2}) (\S+) (.*)$/;

/** LINEの「トーク履歴を送信」で作られた.txtを読む */
export function parseLine(raw: string): LineChat {
  const lines = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  let title = '';
  const head = lines.slice(0, 3).join('\n').match(/(?:\[LINE\]\s*)?(.+?)(?:との|の)トーク履歴/);
  if (head) title = head[1].trim();
  const messages: LineMessage[] = [];
  let date = '';
  let last: LineMessage | null = null;
  for (const line of lines) {
    const day = line.match(LINE_DAY_RE);
    if (day) {
      date = `${day[1]}-${day[2].padStart(2, '0')}-${day[3].padStart(2, '0')}`;
      last = null;
      continue;
    }
    if (!date) continue; // ヘッダー(保存日時など)
    if (LINE_SYS_RE.test(line)) { last = null; continue; } // 「〇〇がメッセージの送信を取り消しました」など
    const m = line.match(LINE_MSG_RE) ?? line.match(LINE_MSG_SPACE_RE);
    if (m) {
      last = { date, time: m[1], sender: m[2].trim(), text: unquote(m[3]) };
      messages.push(last);
    } else if (last && line.trim()) {
      // 改行を含むメッセージの続き
      last.text = unquote(`${last.text}\n${line}`);
    }
  }
  const count = new Map<string, number>();
  for (const m of messages) count.set(m.sender, (count.get(m.sender) ?? 0) + 1);
  const senders = [...count].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return { title, messages, senders };
}

const unquote = (s: string) => (/^"[\s\S]*"$/.test(s.trim()) ? s.trim().slice(1, -1) : s);

/** 自分の名前の推測: 1対1ならトーク名(相手)でない方 */
export function guessSelf(chat: LineChat): string {
  const other = chat.senders.find((s) => s !== chat.title);
  return chat.senders.includes(chat.title) ? (other ?? '') : (chat.senders[1] ?? chat.senders[0] ?? '');
}

const STAMP_RE = /^\[(スタンプ|写真|動画|ファイル|ボイスメッセージ|アルバム|ノート|位置情報|連絡先|Sticker|Photo|Video|File)\]$/;

/** LINEのトークを、話した日ごとに1件の記録にする。相手は自分以外の発言者 */
export function lineToDrafts(chat: LineChat, self: string, opts: { onlyMine: boolean }): ImportDraft[] {
  const days = new Map<string, LineMessage[]>();
  for (const m of chat.messages) {
    if (STAMP_RE.test(m.text.trim()) || !m.text.trim()) continue;
    if (opts.onlyMine && m.sender !== self) continue;
    const list = days.get(m.date) ?? [];
    list.push(m);
    days.set(m.date, list);
  }
  const others = (list: LineMessage[]) => [...new Set(list.map((m) => m.sender).filter((s) => s !== self))];
  // 1対1で自分しか話していない日は、トークの相手にする
  const fallback = chat.senders.includes(chat.title) && chat.title !== self ? [chat.title] : [];
  return [...days].map(([date, list], i) => {
    // 自分の発言だけでも、その日にやり取りした相手を紐づける
    const people = others(chat.messages.filter((m) => m.date === date));
    const text = list.map((m) => `${m.sender === self ? '自分' : m.sender}: ${m.text.trim()}`).join('\n');
    return { key: `l${i}`, include: true, title: '', text, talkedOn: date, people: people.length ? people : fallback, topics: [] };
  });
}
