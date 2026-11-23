import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractKeys } from './keys';
import en from './en';

const files = [
  ...readdirSync('src/ui').filter((f) => /\.tsx?$/.test(f)).map((f) => join('src/ui', f)),
  'src/core/search.ts',
  'src/core/backup.ts',
];
// 画面に出ない日本語(正規表現・内部用)は除外
const IGNORE = new Set(['会話資産のバックアップ']);

describe('翻訳', () => {
  it('画面の文言にすべて英訳がある', () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const k of extractKeys(readFileSync(f, 'utf8'))) {
        if (/^\[/.test(k) || IGNORE.has(k)) continue;
        if (!(k in en)) missing.push(`${f}: ${k}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
