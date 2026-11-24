import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { guessSelf, guessSplit, lineToDrafts, parseLine, splitText, textToDrafts } from './importers';
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
