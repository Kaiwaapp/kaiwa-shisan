import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readZipText, isZip } from './unzip';
import { aiToDrafts, parseAiExport, parseReplyDrafts, guessSelf, guessSplit, lineToDrafts, parseLine, splitText, textToDrafts } from './importers';
import { Store } from './store';
import { IdbRepository } from './idbRepository';

const LINE_IOS = `[LINE] 山田花子とのトーク履歴
保存日時：2026/11/20 21:00

2026/11/18(水)
20:01\t山田花子\t週末なにしてた？
20:03\tキキ\t"京都に紅葉を見に行ってた
東福寺がすごかった"
20:04\t山田花子\t[スタンプ]
20:05\t山田花子がメッセージの送信を取り消しました

2026/11/19(木)
08:10\tキキ\tおはよう、写真送るね
08:11\tキキ\t[写真]
`;

describe('テキストの取り込み', () => {
  it('空行・===・区切らないで分けられる', () => {
    const raw = 'A1\nA2\n\n\nB1\n===\nC1';
    expect(splitText(raw, 'blank')).toEqual(['A1\nA2', 'B1\n===\nC1']);
    expect(splitText(raw, 'marker')).toEqual(['A1\nA2\n\n\nB1', 'C1']);
    expect(splitText(raw, 'none')).toHaveLength(1);
    expect(guessSplit(raw)).toBe('marker');
    expect(guessSplit('a\n\nb')).toBe('blank');
  });

  it('先頭行が日付だけなら話した日にする', () => {
    const [a, b] = textToDrafts('2025年3月4日\n花見の話\n\nふつうのメモ', 'blank', ['さや']);
    expect(a.talkedOn).toBe('2025-03-04');
    expect(a.text).toBe('花見の話');
    expect(a.people).toEqual(['さや']);
    expect(b.text).toBe('ふつうのメモ');
  });
});

describe('LINEの取り込み', () => {
  it('トーク履歴を読み、日ごとに1件・相手を紐づける', () => {
    const chat = parseLine(LINE_IOS);
    expect(chat.title).toBe('山田花子');
    expect(chat.messages).toHaveLength(5);
    expect(chat.messages[1].text).toBe('京都に紅葉を見に行ってた\n東福寺がすごかった');
    const self = guessSelf(chat);
    expect(self).toBe('キキ');
    const drafts = lineToDrafts(chat, self, { onlyMine: false });
    expect(drafts.map((d) => d.talkedOn)).toEqual(['2026-11-18', '2026-11-19']);
    expect(drafts[0].people).toEqual(['山田花子']);
    expect(drafts[0].text).toContain('自分: 京都に紅葉');
    expect(drafts[0].text).not.toContain('[スタンプ]');
    // 自分の発言だけでも、その日の相手は紐づく
    const mine = lineToDrafts(chat, self, { onlyMine: true });
    expect(mine[1].people).toEqual(['山田花子']);
    expect(mine[0].text).not.toContain('週末なにしてた');
  });

  it('改行コードがCRLFでも読める', () => {
    expect(parseLine(LINE_IOS.replace(/\n/g, '\r\n')).messages).toHaveLength(5);
  });
});

describe('取り込みの保存と取り消し', () => {
  it('新しいフォルダに入れ、人は既存に合わせ、取り消すと元に戻る', async () => {
    const s = new Store(new IdbRepository('import-1'));
    await s.init();
    const hana = await s.addPerson('山田花子');
    const before = s.snapshot.entries.length;
    const r = await s.importDrafts(
      [
        { title: '', text: 'a', talkedOn: '2026-11-18', people: ['山田花子'], topics: ['紅葉'] },
        { title: 'b', text: 'b', talkedOn: '2026-11-19', people: ['新しい人'], topics: [] },
      ],
      { newName: 'LINE 山田花子', parentId: null },
    );
    expect(s.snapshot.entries).toHaveLength(before + 2);
    expect(s.snapshot.people).toHaveLength(2);
    const e = s.snapshot.entries.find((x) => x.text === 'a')!;
    expect(e.personIds).toEqual([hana.id]);
    expect(e.folderId).toBe(r.folderIds[0]);
    await s.undoImport(r);
    expect(s.snapshot.entries).toHaveLength(before);
    expect(s.snapshot.people.map((p) => p.name)).toEqual(['山田花子']);
    expect(s.snapshot.folders).toHaveLength(0);
  });
});

const GPT = [{
  title: '京都旅行の計画', create_time: 1763600000, current_node: 'c',
  mapping: {
    root: { parent: null, message: null },
    sys: { parent: 'root', message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
    a: { parent: 'sys', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['紅葉の名所を教えて'] } } },
    old: { parent: 'a', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['(作り直す前の返事)'] } } },
    b: { parent: 'a', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['東福寺がおすすめです。'.repeat(30)] } } },
    c: { parent: 'b', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['ありがとう'] } } },
  },
}];

const CLAUDE = [{
  uuid: 'x', name: '転職の相談', created_at: '2026-10-01T09:00:00Z',
  chat_messages: [
    { sender: 'human', text: '4年目で転職ってどう？', content: [{ type: 'text', text: '4年目で転職ってどう？' }] },
    { sender: 'assistant', text: '', content: [{ type: 'text', text: '良いタイミングです。' }] },
  ],
}];

describe('ChatGPT・Claudeの取り込み', () => {
  it('ChatGPTは表示中の枝だけ、タイトルと日付を使う', () => {
    const { service, conversations } = parseAiExport(JSON.stringify(GPT));
    expect(service).toBe('chatgpt');
    expect(conversations[0].title).toBe('京都旅行の計画');
    expect(conversations[0].messages.map((m) => m.mine)).toEqual([true, false, true]);
    const [d] = aiToDrafts(conversations, { onlyMine: false, aiName: 'ChatGPT', maxReply: 50 });
    expect(d.title).toBe('京都旅行の計画');
    expect(d.text).not.toContain('作り直す前');
    expect(d.text).toContain('ChatGPT: 東福寺');
    expect(d.text).toContain('…');
    const [mine] = aiToDrafts(conversations, { onlyMine: true, aiName: 'ChatGPT', maxReply: 0 });
    expect(mine.text).toBe('自分: 紅葉の名所を教えて\n\n自分: ありがとう');
  });

  it('Claudeの形式を見分けて読む', () => {
    const { service, conversations } = parseAiExport(JSON.stringify(CLAUDE));
    expect(service).toBe('claude');
    expect(conversations[0]).toMatchObject({ title: '転職の相談', date: '2026-10-01' });
    expect(conversations[0].messages[1].text).toBe('良いタイミングです。');
  });

  it('関係ないJSONはエラー', () => {
    expect(() => parseAiExport('{"a":1}')).toThrow();
    expect(() => parseAiExport('[{"a":1}]')).toThrow();
  });

  it('zipのままでも conversations.json を取り出せる', async () => {
    const zip = makeZip([['README.txt', 'hi', false], ['data/conversations.json', JSON.stringify(CLAUDE), true]]);
    expect(isZip(zip)).toBe(true);
    const text = await readZipText(zip.buffer as ArrayBuffer, 'conversations.json');
    expect(parseAiExport(text!).service).toBe('claude');
    expect(await readZipText(zip.buffer as ArrayBuffer, 'none.json')).toBeNull();
  });
});

/** テスト用の小さなzipを作る */
function makeZip(files: [string, string, boolean][]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const le = (n: number, len: number) => { const a = new Uint8Array(len); for (let i = 0; i < len; i++) a[i] = (n >>> (8 * i)) & 255; return a; };
  const cat = (xs: Uint8Array[]) => { const out = new Uint8Array(xs.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of xs) { out.set(x, p); p += x.length; } return out; };
  for (const [name, body, deflate] of files) {
    const nb = enc.encode(name);
    const raw = enc.encode(body);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = deflate ? 8 : 0;
    const local = cat([le(0x04034b50, 4), le(20, 2), le(0, 2), le(method, 2), le(0, 8), le(data.length, 4), le(raw.length, 4), le(nb.length, 2), le(0, 2), nb]);
    central.push(cat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(method, 2), le(0, 8), le(data.length, 4), le(raw.length, 4), le(nb.length, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), le(offset, 4), nb]));
    parts.push(local, data);
    offset += local.length + data.length;
  }
  const cd = cat(central);
  const end = cat([le(0x06054b50, 4), le(0, 4), le(files.length, 2), le(files.length, 2), le(cd.length, 4), le(offset, 4), le(0, 2)]);
  return cat([...parts, cd, end]);
}

describe('AIの返信案の取り込み', () => {
  it('返信を省略せず、相手とタグを取り込む', () => {
    const text = '週末は空いています。\n'.repeat(30).trim();
    const [draft] = parseReplyDrafts('```json\n' + JSON.stringify({
      title: '週末の予定', text, people: [' 田中 ', '田中'], tags: ['#予定', ' 趣味 '],
    }) + '\n```');
    expect(draft).toMatchObject({ title: '週末の予定', text, people: ['田中'], topics: ['予定', '趣味'] });
  });

  it('返信本文がないデータを受け付けない', () => {
    expect(parseReplyDrafts('{"text":" "}')).toEqual([]);
    expect(parseReplyDrafts('テキスト')).toEqual([]);
  });


  it('複数の返信をそれぞれ読み込み、不正な返信が混じると受け付けない', () => {
    const data = [{ text: 'ありがとう', people: ['田中'], tags: ['#お礼'] }, { text: 'また明日', people: ['佐藤'] }];
    const [first, second] = parseReplyDrafts(JSON.stringify(data));
    expect(first).toMatchObject({ text: 'ありがとう', people: ['田中'], topics: ['お礼'] });
    expect(second).toMatchObject({ text: 'また明日', people: ['佐藤'], topics: [] });
    expect(first.key).not.toBe(second.key);
    expect(parseReplyDrafts(JSON.stringify([...data, { text: ' ' }]))).toEqual([]);
  });

  it('読み仮名つきの複数返信を保存し、既存の人の読みは保持する', async () => {
    const store = new Store(new IdbRepository('reply-import-readings'));
    await store.init();
    await store.addPerson('佐藤', null, [], false, 'さとう');
    const drafts = parseReplyDrafts(JSON.stringify([
      { text: 'ありがとう', people: ['山田'], tags: [{ name: '#御礼', reading: 'おれい' }] },
      { text: 'また明日', people: [{ name: '山田', reading: 'やまだ' }, { name: '佐藤', reading: 'さと' }] },
    ]));
    await store.importDrafts(drafts, { id: null });
    expect(store.snapshot.entries).toHaveLength(2);
    expect(store.snapshot.people.find((p) => p.name === '山田')?.reading).toBe('やまだ');
    expect(store.snapshot.people.find((p) => p.name === '佐藤')?.reading).toBe('さとう');
    expect(store.snapshot.topics.find((t) => t.name === '御礼')?.reading).toBe('おれい');
  });
});
