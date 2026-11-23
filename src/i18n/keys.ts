/**
 * 画面の文言(日本語の文字列)をソースから集める。翻訳漏れのチェック(i18n.test.ts)に使う。
 * 画面に出る日本語は、UIのファイルと、core の並べ替えラベル・バックアップのエラーにある。
 */
const JP = /[ぁ-んァ-ヶ一-龥]/;

export function extractKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    const code = raw.replace(/\/\/.*$/, '');
    for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      const s = m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
      if (JP.test(s)) keys.add(s);
    }
  }
  return [...keys];
}
