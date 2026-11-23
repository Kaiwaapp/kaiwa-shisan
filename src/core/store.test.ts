import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { Store } from './store';
import { IdbRepository } from './idbRepository';
import { searchEntries } from './search';
import { parseBackup, toBackup } from './backup';

let n = 0;
const fresh = async () => {
  const s = new Store(new IdbRepository('test-' + n++));
  await s.init();
  return s;
};

describe('Store', () => {
  it('記録を保存して再読み込みできる', async () => {
    const repo = new IdbRepository('persist');
    const s = new Store(repo);
    await s.init();
    const a = await s.addPerson('田中さん');
    const t = await s.addTopic('#キャンプ');
    await s.saveEntry({ text: '富士山でキャンプした話', personIds: [a.id], topicIds: [t.id], talkedOn: '2026-11-20' });
    const s2 = new Store(repo);
    await s2.init();
    expect(s2.snapshot.entries).toHaveLength(1);
    expect(s2.snapshot.topics[0].name).toBe('キャンプ');
    expect(s2.snapshot.entries[0].topics[0].source).toBe('manual');
  });

  it('同じ名前の人・話題は重複作成しない', async () => {
    const s = await fresh();
    const a = await s.addPerson('ヤマダ');
    const b = await s.addPerson('やまだ');
    expect(a.id).toBe(b.id);
  });

  it('人を削除しても記録は残る', async () => {
    const s = await fresh();
    const a = await s.addPerson('A');
    const b = await s.addPerson('B');
    await s.saveEntry({ text: 'x', personIds: [a.id, b.id], topicIds: [], talkedOn: '2026-11-20' });
    await s.deletePerson(a.id);
    expect(s.snapshot.entries[0].personIds).toEqual([b.id]);
  });

  it('本文・人名・話題名で検索できる', async () => {
    const s = await fresh();
    const a = await s.addPerson('佐藤');
    const t = await s.addTopic('旅行');
    await s.saveEntry({ text: '京都でラーメン', personIds: [a.id], topicIds: [t.id], talkedOn: '2026-11-20' });
    await s.saveEntry({ text: '仕事の愚痴', personIds: [], topicIds: [], talkedOn: '2026-11-21' });
    expect(searchEntries(s.snapshot, 'らーめん')).toHaveLength(1);
    expect(searchEntries(s.snapshot, '佐藤 旅行')).toHaveLength(1);
    expect(searchEntries(s.snapshot, '')).toHaveLength(2);
  });

  it('バックアップの書き出し→統合読み込み', async () => {
    const s = await fresh();
    await s.saveEntry({ text: 'one', personIds: [], topicIds: [], talkedOn: '2026-11-20' });
    const json = JSON.stringify(toBackup(s.snapshot));
    const s2 = await fresh();
    await s2.saveEntry({ text: 'two', personIds: [], topicIds: [], talkedOn: '2026-11-21' });
    await s2.importData(parseBackup(json), 'merge');
    expect(s2.snapshot.entries).toHaveLength(2);
    await s2.importData(parseBackup(json), 'replace');
    expect(s2.snapshot.entries).toHaveLength(1);
    expect(() => parseBackup('{"a":1}')).toThrow();
  });
});
