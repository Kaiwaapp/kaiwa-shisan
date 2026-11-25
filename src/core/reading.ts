// 入力から読み仮名を拾う(AIを使わない無料の機能)。
// 日本語入力(IME)で変換する前のひらがなと、変換して確定した文字の組を覚えておき、
// 名前を「覚えた組」と「そのまま打ったかな」に分けて読み仮名を組み立てる。

const KANA = /^[ぁ-ゖゝゞァ-ヺーヽヾ・\s]+$/;
const KANA_CHAR = /[ぁ-ゖゝゞァ-ヺーヽヾ]/;
/** 読み仮名がなくてもよい文字(英数字・記号・空白) */
const NEUTRAL_CHAR = /[\s\p{P}\p{S}\p{N}A-Za-zＡ-Ｚａ-ｚ]/u;

export const isKanaOnly = (s: string): boolean => !!s && KANA.test(s);

/** カタカナをひらがなに(長音などはそのまま) */
export const toHiragana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export class ReadingDict {
  /** 確定した文字 → 変換前のひらがな */
  private pieces = new Map<string, string>();

  /** 変換して確定した text と、その直前のかな kana を覚える */
  add(text: string, kana: string) {
    const t = text.trim();
    const k = toHiragana(kana.replace(/\s/g, ''));
    if (!t || !k || isKanaOnly(t)) return;
    this.pieces.set(t, k);
    // 「田中 太郎」のように確定したものの中に空白があれば、そのままでも引けるよう空白なしでも覚える
    if (/\s/.test(t)) this.pieces.set(t.replace(/\s/g, ''), k);
  }

  /**
   * 名前の読み仮名を組み立てる。覚えた組を長いものから当てはめ、かなはそのまま、英数字・記号は飛ばす。
   * 読めない漢字が残るときは '' (間違った読みを入れないため)
   */
  readingOf(value: string): string {
    const v = value.trim();
    if (!v) return '';
    const keys = [...this.pieces.keys()].sort((a, b) => b.length - a.length);
    let out = '';
    let i = 0;
    let usedPiece = false;
    while (i < v.length) {
      const k = keys.find((key) => v.startsWith(key, i));
      if (k) {
        out += this.pieces.get(k);
        i += k.length;
        usedPiece = true;
        continue;
      }
      const c = v[i];
      if (KANA_CHAR.test(c)) out += toHiragana(c);
      else if (!NEUTRAL_CHAR.test(c)) return '';
      i++;
    }
    // かなだけの名前は読み仮名がいらない(名前そのもので検索できる)
    return usedPiece ? out : '';
  }
}
