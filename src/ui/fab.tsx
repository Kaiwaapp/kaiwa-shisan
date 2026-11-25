// 右下の「＋」。タップはその画面の既定の追加、長押しで「何を作るか」を選ぶメニューを出す。
import { useEffect, useRef, useState } from 'react';
import { go } from './hooks';
import { Sheet } from './interact';
import { t } from '../i18n';

export interface CreateItem { icon: string; label: string; run: () => void }

/** 一覧の画面にある「フォルダ／グループの作成」欄を開くよう頼む(メニューから使う) */
type AddKind = 'folder' | 'group';
const EVT = 'kaiwa:add';
export function requestAdd(kind: AddKind) {
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new CustomEvent(EVT, { detail: kind }));
}
export function useAddRequest(kind: AddKind, onRequest: () => void, enabled = true) {
  const cb = useRef(onRequest);
  cb.current = onRequest;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: Event) => { if ((e as CustomEvent).detail === kind) cb.current(); };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [kind, enabled]);
}

/** メニューの項目。first はタップしたときと同じ動き(一番上に出す) */
export function createItems(o: {
  first: CreateItem;
  people?: string;
  topics?: string;
  entry?: string;
  folder?: boolean;
  group?: boolean;
}): CreateItem[] {
  const items: CreateItem[] = [o.first];
  if (o.entry) items.push({ icon: '✎', label: t('記録を追加'), run: () => go(o.entry!) });
  if (o.people) items.push({ icon: '☺', label: t('人を追加'), run: () => go(o.people!) });
  if (o.topics) items.push({ icon: '#', label: t('話題を追加'), run: () => go(o.topics!) });
  if (o.group) items.push({ icon: '◎', label: t('グループを作成'), run: () => requestAdd('group') });
  if (o.folder) items.push({ icon: '▤', label: t('フォルダを作成'), run: () => requestAdd('folder') });
  return items;
}

const HOLD_MS = 450;

export function Fab({ label, onTap, items }: { label: string; onTap: () => void; items: CreateItem[] }) {
  const [open, setOpen] = useState(false);
  const st = useRef({ timer: 0, x: 0, y: 0, fired: false, guard: false });
  const clear = () => clearTimeout(st.current.timer);
  useEffect(() => clear, []);
  return (
    <>
      <button
        className="fab"
        aria-label={label}
        aria-haspopup="menu"
        title={t('{label}(長押しで他のものを作成)', { label })}
        onPointerDown={(e) => {
          const s = st.current;
          s.fired = false; s.x = e.clientX; s.y = e.clientY;
          clear();
          s.timer = window.setTimeout(() => { s.fired = true; s.guard = true; setOpen(true); }, HOLD_MS);
        }}
        onPointerMove={(e) => { if (Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 10) clear(); }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onPointerLeave={clear}
        // iPhone・PCの長押し／右クリックで出るメニューは出さず、こちらのメニューを出す
        onContextMenu={(e) => { e.preventDefault(); if (!st.current.fired) { clear(); st.current.fired = true; st.current.guard = true; setOpen(true); } }}
        onClick={() => {
          if (st.current.fired) { st.current.fired = false; return; }
          onTap();
        }}
      >
        ＋
      </button>
      {open && (
        // 指を離したときのクリックが、開いたメニューの項目に当たって勝手に選ばれないようにする。
        // メニューの中で改めて指を置くまでのクリックは無視する
        <div
          onPointerDownCapture={() => { st.current.guard = false; }}
          onClickCapture={(e) => { if (st.current.guard) { e.stopPropagation(); e.preventDefault(); } }}
        >
        <Sheet title={t('何を作りますか')} onClose={() => setOpen(false)}>
          {items.map((it) => (
            <button key={it.label} className="sheet-item" role="menuitem" onClick={() => { setOpen(false); it.run(); }}>
              <span className="sheet-icon" aria-hidden>{it.icon}</span>{it.label}
            </button>
          ))}
        </Sheet>
        </div>
      )}
    </>
  );
}
