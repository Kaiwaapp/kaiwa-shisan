import { describe, it, expect } from 'vitest';
import { demoSuggest } from './ai';

describe('お試し表示の提案', () => {
  it('既存の名前・話者・カタカナ語を拾う', async () => {
    const r = await demoSuggest('田中: 来月キャンプに行く\n自分: いいね。旅行の話も聞いた', { people: ['佐藤'], topics: ['旅行'] });
    expect(r.people).toEqual(['田中']);
    expect(r.topics).toEqual(['旅行', 'キャンプ']);
  });
});

describe('お試し表示の提案(括弧)', () => {
  it('括弧で始まる行は話者にしない', async () => {
    const r = await demoSuggest('(お試し表示: サンプル)\n田中: こんにちは', { people: [], topics: [] });
    expect(r.people).toEqual(['田中']);
  });
});

describe('お試し表示のフォルダ振り分け', () => {
  it('フォルダ名が含まれればそこへ、なければ最初の話題へ', async () => {
    const { demoFolders } = await import('./ai');
    const r = await demoFolders(
      [{ text: '仕事の締め切りの話', hints: [] }, { text: 'キャンプ', hints: ['趣味'] }, { text: 'x', hints: [] }],
      ['仕事', '家族 / 子ども'],
    );
    expect(r.assignments).toEqual([{ index: 0, folder: '仕事' }, { index: 1, folder: '趣味' }]);
  });
});
