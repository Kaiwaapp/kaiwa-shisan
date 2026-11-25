import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { Store } from './store';
import { IdbRepository } from './idbRepository';
import { parseBackup, toBackup } from './backup';
import type { EntryImage } from './types';

let n = 0;
const img = (id: string, bytes = [1, 2, 3]): EntryImage => ({
  id, type: 'image/jpeg', data: new Uint8Array(bytes).buffer, width: 10, height: 20, createdAt: 1,
});
const bytes = (i?: EntryImage) => (i ? [...new Uint8Array(i.data)] : undefined);
const base = { personIds: [], topicIds: [], talkedOn: '2026-11-25' };

describe('添付画像', () => {
  it('保存すると画像も保存され、外した画像は消える', async () => {
    const repo = new IdbRepository('img-' + n++);
    const s = new Store(repo);
    await s.init();
    const e = await s.saveEntry({ ...base, text: 'スクショ', imageIds: ['a', 'b'], newImages: [img('a'), img('b', [9]), img('unused')] });
    expect(e.imageIds).toEqual(['a', 'b']);
    expect(bytes(await s.getImage('b'))).toEqual([9]);
    // 付けたけど外した画像は保存しない
    expect(await repo.imageIds()).toEqual(['a', 'b']);

    // 画像を指定せずに編集したら今のまま
    await s.saveEntry({ ...base, text: '編集' }, e.id);
    expect(s.snapshot.entries[0].imageIds).toEqual(['a', 'b']);

    await s.saveEntry({ ...base, text: '編集2', imageIds: ['b'] }, e.id);
    expect(await repo.imageIds()).toEqual(['b']);
    expect(s.snapshot.entries[0].imageIds).toEqual(['b']);

    // 再読み込みしても残る
    const s2 = new Store(repo);
    await s2.init();
    expect(bytes(await s2.getImage('b'))).toEqual([9]);
  });

  it('ゴミ箱にある間は残り、完全に削除すると画像も消える', async () => {
    const repo = new IdbRepository('img-' + n++);
    const s = new Store(repo);
    await s.init();
    const e = await s.saveEntry({ ...base, text: 'x', imageIds: ['a'], newImages: [img('a')] });
    await s.deleteEntry(e.id);
    await s.gcImages();
    expect(await repo.imageIds()).toEqual(['a']);
    await s.purgeEntries([e.id]);
    expect(await repo.imageIds()).toEqual([]);
  });

  it('起動時にどの記録にも付いていない画像を掃除する', async () => {
    const repo = new IdbRepository('img-' + n++);
    await repo.putImage(img('orphan'));
    const s = new Store(repo);
    await s.init();
    expect(await repo.imageIds()).toEqual([]);
  });

  it('バックアップに画像を含めて書き出し・読み込みできる', async () => {
    const s = await (async () => { const x = new Store(new IdbRepository('img-' + n++)); await x.init(); return x; })();
    await s.saveEntry({ ...base, text: 'x', imageIds: ['a'], newImages: [img('a', [0, 255, 128])] });
    const images = await s.imagesOf(s.snapshot.entries);
    const json = JSON.stringify(toBackup(s.snapshot, images));
    const parsed = parseBackup(json);
    expect(parsed.images).toHaveLength(1);

    const repo2 = new IdbRepository('img-' + n++);
    const s2 = new Store(repo2);
    await s2.init();
    await s2.importData(parsed, 'merge');
    expect(s2.snapshot.entries[0].imageIds).toEqual(['a']);
    expect(bytes(await s2.getImage('a'))).toEqual([0, 255, 128]);

    // 画像なしのバックアップ(v3まで)でも読める
    const noImg = parseBackup(JSON.stringify(toBackup(s.snapshot)));
    expect(noImg.images).toEqual([]);
  });
});
