// 記録の添付画像。端末の中だけに保存する。アプリを軽く保つため、縮小・JPEG圧縮してから保存する。
import { useEffect, useState } from 'react';
import { newId, type EntryImage, type ID } from '../core/types';
import { useStore } from './hooks';
import { t } from '../i18n';

/** 長辺の上限(px)。スクショの文字が読める大きさを残しつつ、1枚数百KBに収める */
const MAX_SIDE = 1920;
const QUALITY = 0.8;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; width: number; height: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close?.() };
  } catch {
    // createImageBitmap が使えない・読めない形式は <img> で読む
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = url; });
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(t('画像を読み込めませんでした'));
    }
    return { src: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  }
}

/** 画像ファイルを縮小・JPEG圧縮して、保存用の形にする */
export async function compressImage(file: Blob): Promise<EntryImage> {
  const d = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(d.width, d.height));
  const w = Math.max(1, Math.round(d.width * scale));
  const h = Math.max(1, Math.round(d.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // 透過PNGの背景を白に
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(d.src, 0, 0, w, h);
  d.done();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALITY));
  if (!blob) throw new Error(t('画像を読み込めませんでした'));
  return { id: newId(), type: 'image/jpeg', data: await blob.arrayBuffer(), width: w, height: h, createdAt: Date.now() };
}

/** 表示用のURL。保存済みの画像は id から読み、まだ保存していない画像はその場のデータを使う */
function useImageUrl(id: ID, pending?: EntryImage): string | null {
  const store = useStore();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    const show = (img: EntryImage | undefined) => {
      if (!alive || !img) return;
      made = URL.createObjectURL(new Blob([img.data], { type: img.type }));
      setUrl(made);
    };
    if (pending) show(pending);
    else store.getImage(id).then(show, () => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [store, id, pending]);
  return url;
}

function Thumb({ id, pending, onOpen, onRemove }: { id: ID; pending?: EntryImage; onOpen: () => void; onRemove?: () => void }) {
  const url = useImageUrl(id, pending);
  return (
    <div className="img-thumb">
      <button type="button" className="img-open" onClick={onOpen} aria-label={t('画像を大きく見る')}>
        {url ? <img src={url} alt="" /> : <span className="img-loading" />}
      </button>
      {onRemove && (
        <button type="button" className="img-remove" onClick={onRemove} aria-label={t('画像を外す')}>×</button>
      )}
    </div>
  );
}

function Viewer({ id, pending, onClose }: { id: ID; pending?: EntryImage; onClose: () => void }) {
  const url = useImageUrl(id, pending);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="img-viewer" role="dialog" aria-label={t('画像')} onClick={onClose}>
      {url && <img src={url} alt="" />}
      <button type="button" className="img-viewer-close" onClick={onClose}>{t('閉じる')}</button>
    </div>
  );
}

/** 編集画面の添付画像の並び。タップで大きく表示、×で外す */
export function ImageStrip({ ids, pending, onRemove }: {
  ids: ID[];
  /** まだ保存していない画像(id → 中身) */
  pending: Map<ID, EntryImage>;
  onRemove?: (id: ID) => void;
}) {
  const [open, setOpen] = useState<ID | null>(null);
  if (!ids.length) return null;
  return (
    <>
      <div className="img-strip">
        {ids.map((id) => (
          <Thumb key={id} id={id} pending={pending.get(id)} onOpen={() => setOpen(id)} onRemove={onRemove && (() => onRemove(id))} />
        ))}
      </div>
      {open && <Viewer id={open} pending={pending.get(open)} onClose={() => setOpen(null)} />}
    </>
  );
}
