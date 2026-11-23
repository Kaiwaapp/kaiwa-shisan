import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { Store } from './store';
import { IdbRepository } from './idbRepository';
import { searchEntries, sortEntriesBy, sortNames, statsBy } from './search';
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

  it('新規の人・話題は保存時に作られる', async () => {
    const s = await fresh();
    await s.saveEntry({ text: 'x', personIds: [], topicIds: [], newPeople: ['山田'], newTopics: ['#映画'], talkedOn: '2026-11-20' });
    expect(s.snapshot.people.map((p) => p.name)).toEqual(['山田']);
    expect(s.snapshot.topics.map((t) => t.name)).toEqual(['映画']);
    expect(s.snapshot.entries[0].personIds).toEqual([s.snapshot.people[0].id]);
  });

  it('人を統合すると記録が付け替わり、重複しない', async () => {
    const s = await fresh();
    const a = await s.addPerson('たなか');
    const b = await s.addPerson('田中さん');
    await s.updatePerson(a.id, { memo: '大学の友達' });
    await s.saveEntry({ text: '1', personIds: [a.id, b.id], topicIds: [], talkedOn: '2026-11-20' });
    await s.saveEntry({ text: '2', personIds: [a.id], topicIds: [], talkedOn: '2026-11-21' });
    await s.mergePeople(a.id, b.id);
    expect(s.snapshot.people).toHaveLength(1);
    expect(s.snapshot.people[0].memo).toBe('大学の友達');
    expect(s.snapshot.entries.every((e) => e.personIds.length === 1 && e.personIds[0] === b.id)).toBe(true);
  });

  it('話題を統合できる', async () => {
    const s = await fresh();
    const a = await s.addTopic('ごはん');
    const b = await s.addTopic('グルメ');
    await s.saveEntry({ text: '1', personIds: [], topicIds: [a.id, b.id], talkedOn: '2026-11-20' });
    await s.mergeTopics(a.id, b.id);
    expect(s.snapshot.topics.map((t) => t.name)).toEqual(['グルメ']);
    expect(s.snapshot.entries[0].topics).toEqual([{ topicId: b.id, source: 'manual' }]);
  });

  it('フォルダを消すと中の記録は未分類になる', async () => {
    const s = await fresh();
    const f = await s.addFolder('仕事');
    const e = await s.saveEntry({ text: '1', personIds: [], topicIds: [], talkedOn: '2026-11-20', folderId: f.id });
    expect(e.folderId).toBe(f.id);
    await s.deleteFolder(f.id);
    expect(s.snapshot.entries[0].folderId).toBeNull();
    expect(s.snapshot.folders).toHaveLength(0);
  });

  it('並べ替え', async () => {
    const s = await fresh();
    const a = await s.addPerson('A');
    const b = await s.addPerson('B');
    await s.saveEntry({ text: '1', personIds: [a.id], topicIds: [], talkedOn: '2026-01-01' });
    await s.saveEntry({ text: '2', personIds: [b.id], topicIds: [], talkedOn: '2026-02-01' });
    await s.saveEntry({ text: '3', personIds: [b.id], topicIds: [], talkedOn: '2026-03-01' });
    expect(sortEntriesBy(s.snapshot.entries, 'oldest').map((e) => e.text)).toEqual(['1', '2', '3']);
    const st = statsBy(s.snapshot, 'person');
    const items = s.snapshot.people.map((p) => ({ ...p, stat: st.get(p.id)! }));
    expect(sortNames(items, 'last').map((p) => p.name)).toEqual(['B', 'A']);
    expect(sortNames(items, 'first').map((p) => p.name)).toEqual(['A', 'B']);
    expect(sortNames(items, 'count').map((p) => p.name)).toEqual(['B', 'A']);
  });

  it('最後に見た順', async () => {
    const s = await fresh();
    const a = await s.addPerson('A');
    const b = await s.addPerson('B');
    await new Promise((r) => setTimeout(r, 5));
    await s.markViewed('person', a.id);
    const st = statsBy(s.snapshot, 'person');
    const items = s.snapshot.people.map((p) => ({ ...p, stat: st.get(p.id) ?? { count: 0, first: '', last: '' } }));
    expect(sortNames(items, 'viewed').map((p) => p.name)).toEqual(['A', 'B']);
    const e1 = await s.saveEntry({ text: '1', personIds: [b.id], topicIds: [], talkedOn: '2026-01-01' });
    await s.saveEntry({ text: '2', personIds: [], topicIds: [], talkedOn: '2026-01-02' });
    await new Promise((r) => setTimeout(r, 5));
    await s.markViewed('entry', e1.id);
    expect(sortEntriesBy(s.snapshot.entries, 'viewed').map((e) => e.text)).toEqual(['1', '2']);
  });
});
