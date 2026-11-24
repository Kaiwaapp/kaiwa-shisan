// zipから1ファイルだけ取り出す最小限の実装。ライブラリを入れず、ブラウザ標準の DecompressionStream を使う。
// (ChatGPT・Claudeのエクスポートはzipで届くので、解凍せずにそのまま選べるようにするため)

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

export const isZip = (b: Uint8Array) => b.length > 4 && u32(b, 0) === 0x04034b50;

/** 名前(末尾一致)でファイルを探してテキストで返す。見つからなければ null */
export async function readZipText(buf: ArrayBuffer, name: string): Promise<string | null> {
  const b = new Uint8Array(buf);
  // 末尾の「中央ディレクトリの終わり」を探す
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zipファイルを読み込めませんでした');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder();
  for (let n = 0; n < count && u32(b, p) === 0x02014b50; n++) {
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const fname = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (fname !== name && !fname.endsWith('/' + name)) continue;
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const data = b.subarray(start, start + size);
    if (method === 0) return dec.decode(data);
    if (method !== 8) throw new Error('このzipの圧縮形式には対応していません');
    const out = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(out).text();
  }
  return null;
}
