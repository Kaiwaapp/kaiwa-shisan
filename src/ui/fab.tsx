// 長押しでメニューを出すボタン。右下の「＋」(長押しで何を作るか選ぶ)と話題の保存ボタン(長押しで保存後の動きを選ぶ)で使う。
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { go } from './hooks';
import { Sheet } from './interact';
import { t } from '../i18n';
import { Icon } from './icons';

export interface CreateItem { icon: ReactNode; label: string; run: () => void }

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
  if (o.entry) items.push({ icon: <Icon name="entry" />, label: t('話題を追加'), run: () => go(o.entry!) });
  if (o.people) items.push({ icon: <Icon name="person" />, label: t('人を追加'), run: () => go(o.people!) });
  if (o.topics) items.push({ icon: <Icon name="topic" />, label: t('タグを追加'), run: () => go(o.topics!) });
  if (o.group) items.push({ icon: <Icon name="group" />, label: t('グループを作成'), run: () => requestAdd('group') });
  if (o.folder) items.push({ icon: <Icon name="folder" />, label: t('フォルダを作成'), run: () => requestAdd('folder') });
  return items;
}

const HOLD_MS = 450;

/**
 * タップで onTap、長押し(PCは右クリックも)で items のメニューを出すボタン。＋ボタン・保存ボタンで共通。
 * disabled の間は長押ししてもメニューを出さない(タップは onTap に任せる)。
 */
export function HoldButton({ onTap, items, menuTitle, holdDisabled, children, ...rest }: {
  onTap: () => void;
  items: CreateItem[];
  menuTitle: string;
  holdDisabled?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>) {
  const [open, setOpen] = useState(false);
  const st = useRef({ timer: 0, x: 0, y: 0, fired: false, guard: false });
  const clear = () => clearTimeout(st.current.timer);
  const btn = useRef<HTMLButtonElement>(null);
  const latest = useRef({ onTap, holdDisabled });
  latest.current = { onTap, holdDisabled };
  const openMenu = () => { const s = st.current; s.fired = true; s.guard = true; setOpen(true); };
  const hold = (x: number, y: number) => {
    const s = st.current;
    s.fired = false; s.x = x; s.y = y;
    clear();
    if (!latest.current.holdDisabled) s.timer = window.setTimeout(openMenu, HOLD_MS);
  };
  // iPhoneでは CSS の user-select / touch-callout だけでは長押しの文字選択が止まらないことがある。
  // 指のときは touchstart を preventDefault して文字選択・長押しメニュー・クリックを全部止め、タップも自分で判定する
  useEffect(() => {
    const el = btn.current!;
    const start = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); const p = e.touches[0]; hold(p.clientX, p.clientY); };
    const move = (e: TouchEvent) => { const p = e.touches[0]; if (p && Math.hypot(p.clientX - st.current.x, p.clientY - st.current.y) > 10) clear(); };
    const end = (e: TouchEvent) => {
      clear();
      if (e.cancelable) e.preventDefault();
      const s = st.current;
      const p = e.changedTouches[0];
      if (s.fired || !p) return;
      // ボタンの外で離したらタップにしない
      const r = el.getBoundingClientRect();
      if (p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom) latest.current.onTap();
    };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', clear);
    return () => {
      clear();
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', clear);
    };
  }, []);
  // 以下のポインタ処理はマウス・ペン用(指は上の touch で扱う)
  const isTouch = (e: { pointerType: string }) => e.pointerType === 'touch';
  return (
    <>
      <button
        {...rest}
        ref={btn}
        aria-haspopup="menu"
        onPointerDown={(e) => { if (!isTouch(e)) hold(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (!isTouch(e) && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 10) clear(); }}
        onPointerUp={(e) => { if (!isTouch(e)) clear(); }}
        onPointerCancel={(e) => { if (!isTouch(e)) clear(); }}
        onPointerLeave={(e) => { if (!isTouch(e)) clear(); }}
        // iPhone・PCの長押し／右クリックで出るメニューは出さず、こちらのメニューを出す
        onContextMenu={(e) => { e.preventDefault(); if (!st.current.fired && !holdDisabled) { clear(); openMenu(); } }}
        onClick={() => {
          if (st.current.fired) { st.current.fired = false; return; }
          onTap();
        }}
      >
        {children}
      </button>
      {open && (
        // 指を離したときのクリックが、開いたメニューの項目に当たって勝手に選ばれないようにする。
        // メニューの中で改めて指を置くまでのクリックは無視する
        <div
          onPointerDownCapture={() => { st.current.guard = false; }}
          onClickCapture={(e) => { if (st.current.guard) { e.stopPropagation(); e.preventDefault(); } }}
        >
          <Sheet title={menuTitle} onClose={() => setOpen(false)}>
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

/** 右下の＋ */
export function Fab({ label, onTap, items }: { label: string; onTap: () => void; items: CreateItem[] }) {
  return (
    <HoldButton className="fab" aria-label={label} title={t('{label}(長押しで他のものを作成)', { label })} onTap={onTap} items={items} menuTitle={t('何を作りますか')}>
      ＋
    </HoldButton>
  );
}
