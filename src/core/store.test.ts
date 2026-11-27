import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { Store, folderPath } from './store';
import { IdbRepository } from './idbRepository';
import { nameMatches, searchEntries, sortEntriesBy, sortNames, statsBy } from './search';
import { parseBackup, toBackup } from './backup';
import { entryHasPerson, entryLabel, entryPreview } from './types';

let n = 0;
const fresh = async () => {
  const s = new Store(new IdbRepository('test-' + n++));
  await s.init();
  return s;
};

describe('Store', () => {
  it('話題から追加した同名の人と新規タグにそれぞれの読み仮名を保存する', async () => {
    const s = await fresh();
    s.readingGuess = () => 'じどう';
    const entry = await s.saveEntry({
      text: 'テスト', personIds: [], topicIds: [], talkedOn: '2026-11-26',
      newPeople: [{ name: '和田', reading: ' わだ ' }, { name: '和田', reading: '' }],
      newTopics: [{ name: '旅行', reading: 'りょこう' }, '散歩'],
    });
    expect(entry.personIds).toHaveLength(2);
    expect(s.snapshot.people.map((p) => p.reading)).toEqual(['わだ', undefined]);
    expect(s.snapshot.topics.map((t) => t.reading)).toEqual(['りょこう', 'じどう']);
  });

  it('タグをまとめて登録し、同じ名前のタグは登録しない', async () => {
    const s = await fresh();
    await s.addTopic('旅行');
    const n = await s.addTopicsBulk([{ name: '旅行' }, { name: '映画', reading: 'えいが' }, { name: '映画' }]);
    expect(n).toBe(1);
    expect(s.snapshot.topics.map((t) => t.name)).toEqual(['旅行', '映画']);
    expect(s.snapshot.topics[1].reading).toBe('えいが');
  });

  it('話題を保存して再読み込みできる', async () => {
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

  it('タイトルを付けて保存・検索・バックアップでき、空なら本文1行目が見出しになる', async () => {
    const s = await fresh();
    const e1 = await s.saveEntry({ title: '  夏の旅行  ', text: '沖縄の話\n2行目', personIds: [], topicIds: [], talkedOn: '2026-11-20' });
    const e2 = await s.saveEntry({ title: '   ', text: '1行目\n2行目', personIds: [], topicIds: [], talkedOn: '2026-11-21' });
    expect(e1.title).toBe('夏の旅行');
    expect(e2.title).toBeUndefined();
    expect(entryLabel(e1)).toBe('夏の旅行');
    expect(entryLabel(e2)).toBe('1行目');
    expect(searchEntries(s.snapshot, '旅行').map((e) => e.id)).toEqual([e1.id]);
    const back = parseBackup(JSON.stringify(toBackup(s.snapshot)));
    expect(back.entries.find((e) => e.id === e1.id)?.title).toBe('夏の旅行');
    // タイトルだけの話題も保存できる
    const e3 = await s.saveEntry({ title: 'タイトルだけ', text: '', personIds: [], topicIds: [], talkedOn: '2026-11-22' });
    expect(entryLabel(e3)).toBe('タイトルだけ');
  });

  it('一覧用の2行表示: 見出し1行と続き1行(改行は空白にまとめる)', () => {
    expect(entryPreview({ title: '夏の旅行', text: '沖縄の話\n海がきれい' })).toEqual({ head: '夏の旅行', rest: '沖縄の話 海がきれい' });
    expect(entryPreview({ text: '\n1行目\n2行目\n\n3行目' })).toEqual({ head: '1行目', rest: '2行目 3行目' });
    expect(entryPreview({ text: '1行だけ' })).toEqual({ head: '1行だけ', rest: '' });
    expect(entryPreview({ text: '  ' })).toEqual({ head: '', rest: '' });
  });

  it('AIの提案から付けたタグは source が ai になる', async () => {
    const s = await fresh();
    const t = await s.addTopic('旅行');
    const m = await s.addTopic('仕事');
    const e = await s.saveEntry({
      text: '京都旅行の話', personIds: [], topicIds: [t.id, m.id], newTopics: ['紅葉'],
      aiTopicIds: [t.id], aiNewTopics: ['紅葉'], talkedOn: '2026-11-20',
    });
    const src = Object.fromEntries(e.topics.map((x) => [s.snapshot.topics.find((y) => y.id === x.topicId)!.name, x.source]));
    expect(src).toEqual({ 旅行: 'ai', 仕事: 'manual', 紅葉: 'ai' });
  });

  it('同じ名前の人・タグは重複作成しない', async () => {
    const s = await fresh();
    const a = await s.addPerson('ヤマダ');
    const b = await s.addPerson('やまだ');
    expect(a.id).toBe(b.id);
  });

  it('人を削除しても話題は残る', async () => {
    const s = await fresh();
    const a = await s.addPerson('A');
    const b = await s.addPerson('B');
    await s.saveEntry({ text: 'x', personIds: [a.id, b.id], topicIds: [], talkedOn: '2026-11-20' });
    await s.deletePerson(a.id);
    expect(s.snapshot.entries[0].personIds).toEqual([b.id]);
  });

  it('本文・人名・タグ名で検索できる', async () => {
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

  it('新規の人・タグは保存時に作られる', async () => {
    const s = await fresh();
    await s.saveEntry({ text: 'x', personIds: [], topicIds: [], newPeople: ['山田'], newTopics: ['#映画'], talkedOn: '2026-11-20' });
    expect(s.snapshot.people.map((p) => p.name)).toEqual(['山田']);
    expect(s.snapshot.topics.map((t) => t.name)).toEqual(['映画']);
    expect(s.snapshot.entries[0].personIds).toEqual([s.snapshot.people[0].id]);
  });

  it('人を統合すると話題が付け替わり、重複しない', async () => {
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

  it('タグを統合できる', async () => {
    const s = await fresh();
    const a = await s.addTopic('ごはん');
    const b = await s.addTopic('グルメ');
    await s.saveEntry({ text: '1', personIds: [], topicIds: [a.id, b.id], talkedOn: '2026-11-20' });
    await s.mergeTopics(a.id, b.id);
    expect(s.snapshot.topics.map((t) => t.name)).toEqual(['グルメ']);
    expect(s.snapshot.entries[0].topics).toEqual([{ topicId: b.id, source: 'manual' }]);
  });

  it('フォルダを消すと中の話題は未分類になる', async () => {
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

  it('フォルダの入れ子・移動・削除', async () => {
    const s = await fresh();
    const work = await s.addFolder('仕事');
    const mtg = await s.addFolder('会議', work.id);
    const deep = await s.addFolder('週次', mtg.id);
    expect(folderPath(s.snapshot.folders, deep.id).map((f) => f.name)).toEqual(['仕事', '会議', '週次']);
    await s.moveFolder(work.id, deep.id); // 子孫の中へは移せない
    expect(s.snapshot.folders.find((f) => f.id === work.id)!.parentId).toBeNull();
    await s.saveEntry({ text: 'm', personIds: [], topicIds: [], talkedOn: '2026-01-01', folderId: mtg.id });
    await s.deleteFolder(mtg.id);
    expect(s.snapshot.entries[0].folderId).toBe(work.id);
    expect(s.snapshot.folders.find((f) => f.id === deep.id)!.parentId).toBe(work.id);
  });

  it('読み仮名で検索できる', async () => {
    const s = await fresh();
    const p = await s.addPerson('江口');
    await s.updatePerson(p.id, { reading: 'えぐち' });
    await s.saveEntry({ text: '映画の話', personIds: [p.id], topicIds: [], talkedOn: '2026-01-01' });
    const pp = s.snapshot.people[0];
    expect(nameMatches(pp, 'エグ')).toBe(true);
    expect(nameMatches(pp, '江')).toBe(true);
    expect(nameMatches(pp, 'たなか')).toBe(false);
    expect(searchEntries(s.snapshot, 'えぐち')).toHaveLength(1);
  });

  it('人用・タグ用のフォルダ', async () => {
    const s = await fresh();
    const pf = await s.addFolder('友人', null, 'person');
    const ef = await s.addFolder('友人');
    expect(pf.id).not.toBe(ef.id);
    const a = await s.addPerson('A', pf.id);
    expect(a.folderId).toBe(pf.id);
    const sub = await s.addFolder('大学', pf.id, 'person');
    await s.updatePerson(a.id, { folderId: sub.id });
    await s.deleteFolder(sub.id);
    expect(s.snapshot.people[0].folderId).toBe(pf.id);
  });

  it('ゴミ箱・ピン留め・まとめて移動', async () => {
    const s = await fresh();
    const f = await s.addFolder('F');
    const a = await s.saveEntry({ text: 'a', personIds: [], topicIds: [], talkedOn: '2026-01-01', folderId: f.id });
    const b = await s.saveEntry({ text: 'b', personIds: [], topicIds: [], talkedOn: '2026-01-01' });
    await s.setPinned('entry', [b.id], true);
    expect(s.snapshot.entries.find((e) => e.id === b.id)!.pinned).toBe(true);
    await s.moveItems('entry', [b.id], f.id);
    expect(s.snapshot.entries.every((e) => e.folderId === f.id)).toBe(true);
    await s.trashEntries([a.id]);
    expect(s.snapshot.entries.map((e) => e.text)).toEqual(['b']);
    expect(s.trash.map((e) => e.text)).toEqual(['a']);
    await s.deleteFolder(f.id);
    await s.restoreEntries([a.id]);
    expect(s.snapshot.entries.find((e) => e.id === a.id)!.folderId).toBeNull();
    await s.trashEntries([a.id]);
    await s.purgeEntries([a.id]);
    expect(s.trash).toHaveLength(0);
    expect(s.snapshot.entries).toHaveLength(1);
  });
  it('お気に入り(話題・人・タグ)。話題を編集してもお気に入り・ピン留めは残る', async () => {
    const s = await fresh();
    const e = await s.saveEntry({ text: 'a', personIds: [], topicIds: [], talkedOn: '2026-01-01' });
    const p = await s.addPerson('ゆい');
    const tp = await s.addTopic('旅行');
    await s.setFavorite('entry', [e.id], true);
    await s.setPinned('entry', [e.id], true);
    await s.setFavorite('person', [p.id], true);
    await s.setFavorite('topic', [tp.id], true);
    await s.saveEntry({ text: 'a2', personIds: [], topicIds: [], talkedOn: '2026-01-01' }, e.id);
    const saved = s.snapshot.entries.find((x) => x.id === e.id)!;
    expect(saved.favorite).toBe(true);
    expect(saved.pinned).toBe(true);
    expect(s.snapshot.people[0].favorite).toBe(true);
    expect(s.snapshot.topics[0].favorite).toBe(true);
    await s.setFavorite('entry', [e.id], false);
    expect(s.snapshot.entries[0].favorite).toBe(false);
    const n = await s.saveEntry({ text: 'b', personIds: [], topicIds: [], talkedOn: '2026-01-01', favorite: true });
    expect(n.favorite).toBe(true);
  });
  it('フォルダ内の話題をまとめて削除(中のフォルダを含むか選べる)', async () => {
    const s = await fresh();
    const f = await s.addFolder('F');
    const sub = await s.addFolder('Sub', f.id);
    const mk = (text: string, folderId: string | null) => s.saveEntry({ text, personIds: [], topicIds: [], talkedOn: '2026-01-01', folderId });
    await mk('a', f.id); await mk('b', f.id); await mk('c', sub.id); await mk('d', null);
    expect(s.folderEntryIds(f.id, false)).toHaveLength(2);
    expect(s.folderEntryIds(f.id, true)).toHaveLength(3);
    expect(await s.trashFolderEntries(f.id, false)).toBe(2);
    expect(s.snapshot.entries.map((e) => e.text).sort()).toEqual(['c', 'd']);
    expect(await s.trashFolderEntries(f.id, true)).toBe(1);
    expect(s.snapshot.entries.map((e) => e.text)).toEqual(['d']);
    expect(s.trash).toHaveLength(3);
    // フォルダは残る
    expect(s.snapshot.folders).toHaveLength(2);
  });
});

describe('人のグループ', () => {
  it('1人を複数のグループに入れられ、再読み込みしても残る', async () => {
    const repo = new IdbRepository('groups-persist');
    const s = new Store(repo);
    await s.init();
    const a = await s.addPerson('田中');
    const b = await s.addPerson('佐藤');
    const app = await s.addGroup('マッチングアプリ');
    const work = await s.addGroup('職場');
    expect(await s.addGroup(' マッチングアプリ ')).toBe(app);
    await s.setGroupMembers(app.id, [a.id, b.id], true);
    await s.setGroupMembers(work.id, [a.id], true);
    await s.setGroupMembers(work.id, [a.id], true); // 2回入れても重ならない
    const s2 = new Store(repo);
    await s2.init();
    expect(s2.snapshot.groups.map((g) => g.name).sort()).toEqual(['マッチングアプリ', '職場'].sort());
    expect(s2.snapshot.people.find((p) => p.id === a.id)!.groupIds).toEqual([app.id, work.id]);
    await s2.setGroupMembers(app.id, [b.id], false);
    expect(s2.snapshot.people.find((p) => p.id === b.id)!.groupIds).toEqual([]);
  });

  it('グループを消しても人は残り、紐づけだけ外れる', async () => {
    const s = await fresh();
    const g = await s.addGroup('大学');
    const a = await s.addPerson('鈴木', null, [g.id]);
    await s.deleteGroup(g.id);
    expect(s.snapshot.groups).toHaveLength(0);
    expect(s.snapshot.people.find((p) => p.id === a.id)!.groupIds).toEqual([]);
  });

  it('人を統合するとグループもまとまる', async () => {
    const s = await fresh();
    const g1 = await s.addGroup('職場');
    const g2 = await s.addGroup('大学');
    const a = await s.addPerson('田中', null, [g1.id]);
    const b = await s.addPerson('たなか', null, [g2.id]);
    await s.mergePeople(b.id, a.id);
    expect(s.snapshot.people.find((p) => p.id === a.id)!.groupIds).toEqual([g1.id, g2.id]);
  });

  it('バックアップに含まれ、古いバックアップ(グループなし)も読める', async () => {
    const s = await fresh();
    const g = await s.addGroup('職場');
    await s.addPerson('田中', null, [g.id]);
    const back = parseBackup(JSON.stringify(toBackup(s.snapshot)));
    expect(back.groups).toHaveLength(1);
    expect(back.people[0].groupIds).toEqual([g.id]);
    const old = parseBackup(JSON.stringify({ format: 'kaiwa-shisan-backup', version: 2, people: [], topics: [], entries: [], folders: [] }));
    expect(old.groups).toEqual([]);
    const s2 = await fresh();
    await s2.importData(back, 'merge');
    expect(s2.snapshot.groups[0].name).toBe('職場');
  });
});

describe('起動時の読み込み', () => {
  const empty = { people: [], topics: [], entries: [], folders: [], groups: [] };
  const repoOf = (loadAll: () => Promise<any>) => ({ loadAll, putEntry: async () => {}, deleteEntry: async () => {} }) as any;

  it('読み終わるまで loaded にならない', async () => {
    let done!: (v: any) => void;
    const s = new Store(repoOf(() => new Promise((r) => { done = r; })));
    const p = s.init();
    expect(s.loaded).toBe(false);
    done({ ...empty, entries: [{ id: 'a', text: 'x', personIds: [], topics: [], folderId: null, talkedOn: '2026-11-24', createdAt: 1, updatedAt: 1 }] });
    await p;
    expect(s.loaded).toBe(true);
    expect(s.snapshot.entries).toHaveLength(1);
  });

  it('失敗してもやり直して読み込む', async () => {
    let n = 0;
    const s = new Store(repoOf(async () => { if (n++ < 2) throw new Error('Connection to Indexed Database server lost'); return empty; }));
    await s.init();
    expect(s.loaded).toBe(true);
    expect(s.loadFailed).toBe(false);
  });

  it('ずっと失敗したら loadFailed になり、後から再試行できる', async () => {
    let ok = false;
    const s = new Store(repoOf(async () => { if (!ok) throw new Error('x'); return empty; }));
    await s.init();
    expect(s.loaded).toBe(false);
    expect(s.loadFailed).toBe(true);
    ok = true;
    await s.init();
    expect(s.loaded).toBe(true);
    expect(s.loadFailed).toBe(false);
  });
  it('話題にグループ自体を付けられ、メンバーの話題・検索・回数にも出る。グループを消すと外れる', async () => {
    const s = await fresh();
    const g = await s.addGroup('職場');
    const a = await s.addPerson('佐藤', null, [g.id]);
    const b = await s.addPerson('鈴木');
    const e = await s.saveEntry({ text: '会議の話', personIds: [], groupIds: [g.id], topicIds: [], talkedOn: '2026-11-20' });
    expect(e.groupIds).toEqual([g.id]);
    expect(e.personIds).toEqual([]);
    expect(entryHasPerson(e, a)).toBe(true);
    expect(entryHasPerson(e, b)).toBe(false);
    expect(statsBy(s.snapshot, 'person').get(a.id)?.count).toBe(1);
    expect(searchEntries(s.snapshot, '職場').map((x) => x.id)).toEqual([e.id]);
    // 編集で groupIds を渡さなければそのまま
    const e2 = await s.saveEntry({ text: '会議の話2', personIds: [], topicIds: [], talkedOn: '2026-11-20' }, e.id);
    expect(e2.groupIds).toEqual([g.id]);
    await s.deleteGroup(g.id);
    expect(s.snapshot.entries[0].groupIds).toBeUndefined();
  });

  it('話題の新しい相手は、同じ名前の人がいても別の人として作る', async () => {
    const s = await fresh();
    const a = await s.addPerson('田中');
    const e = await s.saveEntry({ text: 'x', personIds: [a.id], newPeople: ['田中'], topicIds: [], talkedOn: '2026-11-20' });
    expect(s.snapshot.people.filter((p) => p.name === '田中')).toHaveLength(2);
    expect(e.personIds).toHaveLength(2);
    // 人の追加画面などは今までどおり同名の人を返す
    expect((await s.addPerson('田中')).id).toBe(a.id);
  });
});

import { applyIncremental, diffSince, makeManifest, readBackup, toIncremental } from './backup';
import { moveInList, reorderValues } from './search';
import { ReadingDict } from './reading';

describe('手動の並び順・増分エクスポート・読み仮名', () => {
  it('並べ替えると手動の順に並ぶ', () => {
    const items = [
      { id: 'a', createdAt: 3 }, { id: 'b', createdAt: 2 }, { id: 'c', createdAt: 1 },
    ];
    const arranged = moveInList(['a', 'b', 'c'], 'a', 'c', true);
    expect(arranged).toEqual(['b', 'c', 'a']);
    const v = reorderValues(items, arranged);
    const sorted = items.map((x) => ({ ...x, order: v.get(x.id) })).sort((x, y) => x.order! - y.order!).map((x) => x.id);
    expect(sorted).toEqual(['b', 'c', 'a']);
  });

  it('増分は変更・削除だけを書き出し、反映できる', () => {
    const base = { people: [], topics: [], folders: [], groups: [], entries: [
      { id: 'e1', text: 'a', personIds: [], topics: [], talkedOn: '2026-01-01', folderId: null, createdAt: 1, updatedAt: 1 },
      { id: 'e2', text: 'b', personIds: [], topics: [], talkedOn: '2026-01-01', folderId: null, createdAt: 1, updatedAt: 1 },
    ] };
    const m = makeManifest(base, 10);
    const now = { ...base, entries: [{ ...base.entries[0], pinned: true }] };
    expect(diffSince(now, m).count).toBe(2);
    const file = readBackup(JSON.stringify(toIncremental(now, m)));
    expect(file.kind).toBe('incremental');
    expect(file.data.entries.map((e) => e.id)).toEqual(['e1']);
    const applied = applyIncremental(base, file);
    expect(applied.entries.find((e) => e.id === 'e1')?.pinned).toBe(true);
    expect(applied.entries.find((e) => e.id === 'e2')?.deletedAt).toBeTruthy();
  });

  it('変換前のかなから読み仮名を組み立てる', () => {
    const d = new ReadingDict();
    d.add('田中', 'たなか');
    expect(d.readingOf('田中さん')).toBe('たなかさん');
    expect(d.readingOf('山田')).toBe('');
    expect(d.readingOf('さとう')).toBe('');
  });
});

describe('見本', () => {
  it('見本だけを消し、自分の話題と、その話題に使った見本のタグは残す', async () => {
    const s = await fresh();
    expect(s.isEmpty).toBe(true);
    await s.addSamples();
    expect(s.hasSamples).toBe(true);
    const travel = s.snapshot.topics.find((t) => t.name === '旅行')!;
    const sampleEntry = s.snapshot.entries.find((e) => e.sample && e.personIds.length)!;
    // 見本の話題を編集したら自分の話題になる
    await s.saveEntry({ text: sampleEntry.text + '追記', personIds: sampleEntry.personIds, topicIds: sampleEntry.topics.map((x) => x.topicId), talkedOn: sampleEntry.talkedOn }, sampleEntry.id);
    const mine = await s.saveEntry({ text: '自分の話題', personIds: [], topicIds: [travel.id], talkedOn: '2026-11-26' });
    await s.removeSamples();
    expect(s.hasSamples).toBe(false);
    const d = s.snapshot;
    expect(d.entries.map((e) => e.id).sort()).toEqual([mine.id, sampleEntry.id].sort());
    expect(d.topics.some((t) => t.id === travel.id && !t.sample)).toBe(true);
    // 編集した見本の話題に付いていた人は残り、使われていない見本の人は消える
    expect(d.people.length).toBe(new Set(sampleEntry.personIds).size);
  });

  it('同じ名前のタグがあれば作らずに使う', async () => {
    const s = await fresh();
    const mine = await s.addTopic('旅行');
    await s.addSamples();
    expect(s.snapshot.topics.filter((t) => t.name === '旅行')).toEqual([mine]);
    await s.removeSamples();
    expect(s.snapshot.topics).toEqual([mine]);
  });
});
