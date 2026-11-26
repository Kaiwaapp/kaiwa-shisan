import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { Store } from './store';
import { IdbRepository } from './idbRepository';
import { parseBackup, toBackup } from './backup';
import { eventsOf, splitByDate, toIcs } from './schedule';

let n = 0;
const fresh = async (name = 'sched-' + n++) => {
  const s = new Store(new IdbRepository(name));
  await s.init();
  return s;
};

describe('予定', () => {
  it('保存・再読み込み・人の削除と統合で紐づけを直す', async () => {
    const s = await fresh('sched-persist');
    const a = await s.addPerson('Aさん');
    const b = await s.addPerson('Bさん');
    const ev = await s.saveEvent({ title: '', date: '2026-12-01', time: '19:00', endTime: '18:00', personIds: [a.id], newPeople: ['Cさん'] });
    expect(ev.endTime).toBeUndefined(); // 開始より前の終了は付けない
    expect(ev.personIds).toHaveLength(2);
    const s2 = await fresh('sched-persist');
    expect(s2.snapshot.events).toHaveLength(1);
    await s2.mergePeople(a.id, b.id);
    expect(s2.snapshot.events![0].personIds).toContain(b.id);
    await s2.deletePerson(b.id);
    expect(s2.snapshot.events![0].personIds).not.toContain(b.id);
    await s2.deleteEvent(ev.id);
    expect(s2.snapshot.events).toHaveLength(0);
  });

  it('グループの予定もその人の予定に出る。バックアップに入る', async () => {
    const s = await fresh();
    const g = await s.addGroup('サークル');
    const p = await s.addPerson('Dさん', null, [g.id]);
    await s.saveEvent({ title: '飲み会', date: '2026-12-02', personIds: [], groupIds: [g.id] });
    expect(eventsOf(s.snapshot.events!, s.snapshot.people.find((x) => x.id === p.id)!)).toHaveLength(1);
    const back = parseBackup(JSON.stringify(toBackup(s.snapshot)));
    expect(back.events).toHaveLength(1);
    await s.deleteGroup(g.id);
    expect(s.snapshot.events![0].groupIds).toBeUndefined();
  });

  it('今日以降と過去に分ける', () => {
    const base = { personIds: [], createdAt: 0, updatedAt: 0, title: 'x' };
    const r = splitByDate([{ ...base, id: '1', date: '2026-11-25' }, { ...base, id: '2', date: '2026-11-26', time: '10:00' }, { ...base, id: '3', date: '2026-11-26' }], '2026-11-26');
    expect(r.upcoming.map((e) => e.id)).toEqual(['3', '2']);
    expect(r.past.map((e) => e.id)).toEqual(['1']);
  });

  it('.icsを作る(終日・時刻あり・通知・長い行の折り返し)', () => {
    const ics = toIcs([
      { id: 'a', title: 'ごはん, 渋谷', date: '2026-12-01', personIds: [], alarm: '1d', createdAt: 0, updatedAt: 0 },
      { id: 'b', title: '映画', date: '2026-12-03', time: '18:30', endTime: '21:00', personIds: [], memo: 'あ'.repeat(60), alarm: '1h', createdAt: 0, updatedAt: 0 },
    ], () => ['Aさん'], 0);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
    expect(ics).toContain('SUMMARY:ごはん\\, 渋谷');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).toContain('DTSTART:20261203T183000');
    expect(ics).toContain('TRIGGER:-PT1H');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
