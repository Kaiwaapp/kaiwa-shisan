import { describe, it, expect } from 'vitest';
import { cleanProfile, mergeProfiles } from './types';
import { demoParse } from './aiProfile';
import { nameMatches } from './search';

const specs = [
  { id: 'age', label: '年齢' }, { id: 'job', label: '仕事' }, { id: 'hobbies', label: '趣味' },
  { id: 'hometown', label: '出身' }, { id: 'f_x', label: '身長' },
];

describe('プロフィール', () => {
  it('空の項目を取り除く', () => {
    expect(cleanProfile({ fields: { age: ' ', job: ' 看護師 ' }, extra: [{ label: '', value: '' }] })).toEqual({ fields: { job: '看護師' } });
    expect(cleanProfile({ fields: {} })).toBeUndefined();
  });
  it('まとめるときは残す側を優先し、空の項目だけ埋める', () => {
    const m = mergeProfiles({ fields: { job: 'A' } }, { fields: { job: 'B', age: '30歳' }, extra: [{ label: '血液型', value: 'O' }] });
    expect(m).toEqual({ fields: { job: 'A', age: '30歳' }, extra: [{ label: '血液型', value: 'O' }] });
  });
  it('お試しの読み取り: 見出し付きの行と言い回しを拾う', () => {
    const p = demoParse('仕事: 保育士\n身長：158cm\nお酒: 少し\n福岡出身で、趣味はキャンプです。28歳', specs);
    expect(p.fields).toEqual({ job: '保育士', f_x: '158cm', hometown: '福岡', hobbies: 'キャンプ', age: '28歳' });
    expect(p.extra).toEqual([{ label: 'お酒', value: '少し' }]);
  });
  it('人はプロフィールの値でも検索できる', () => {
    expect(nameMatches({ name: 'ゆき', profile: { fields: { job: '看護師' } } }, '看護')).toBe(true);
    expect(nameMatches({ name: 'ゆき' }, '看護')).toBe(false);
  });
});
