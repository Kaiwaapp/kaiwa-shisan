import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { FolderScope, ID } from '../core/types';
import type { Store } from '../core/store';
import { foldersOf, folderDescendants, folderPath } from '../core/store';
import { folderChoices } from './folders';
import { useData, useStore } from './hooks';
import { t } from '../i18n';

/** 長押し・ドラッグ・複数選択の対象 */
export type ItemKind = 'entry' | 'person' | 'topic' | 'folder';
export interface ItemRef {
  kind: ItemKind;
  id: ID;
  label: string;
  /** フォルダの場合はそのフォルダの種類 */
  scope: FolderScope;
}
export const itemKey = (i: { kind: ItemKind; id: ID }) => `${i.kind}:${i.id}`;
export const scopeOfKind = (k: 'entry' | 'person' | 'topic'): FolderScope => k;

// ---------------- トースト ----------------
let showToast: ((m: string) => void) | null = null;
export const toast = (m: string) => showToast?.(m);

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>(0);
  useEffect(() => {
    showToast = (m) => {
      setMsg(m);
      clearTimeout(t.current);
      t.current = window.setTimeout(() => setMsg(null), 1800);
    };
    return () => { showToast = null; };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

// ---------------- クリップボード ----------------
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('コピーしました');
}

// ---------------- 長押しメニュー / 移動先選択 / 複数選択 の共有状態 ----------------
interface UiState {
  menu: ItemRef | null;
  move: ItemRef[] | null;
}
interface SelectState {
  active: boolean;
  selected: Map<string, ItemRef>;
}
interface Ctx {
  ui: UiState;
  openMenu: (i: ItemRef) => void;
  openMove: (items: ItemRef[]) => void;
  close: () => void;
  sel: SelectState;
  setSelecting: (on: boolean) => void;
  toggle: (i: ItemRef) => void;
  clearSel: () => void;
}
const InteractCtx = createContext<Ctx>(null!);
export const useInteract = () => useContext(InteractCtx);

export function InteractProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiState>({ menu: null, move: null });
  const [sel, setSel] = useState<SelectState>({ active: false, selected: new Map() });
  // 画面を移動したら選択モードを終える
  useEffect(() => {
    const on = () => setSel({ active: false, selected: new Map() });
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const ctx: Ctx = {
    ui,
    openMenu: (i) => setUi({ menu: i, move: null }),
    openMove: (items) => setUi({ menu: null, move: items }),
    close: () => setUi({ menu: null, move: null }),
    sel,
    setSelecting: (on) => setSel({ active: on, selected: new Map() }),
    toggle: (i) =>
      setSel((s) => {
        const m = new Map(s.selected);
        const k = itemKey(i);
        if (m.has(k)) m.delete(k);
        else m.set(k, i);
        return { ...s, selected: m };
      }),
    clearSel: () => setSel({ active: false, selected: new Map() }),
  };
  return (
    <InteractCtx.Provider value={ctx}>
      {children}
      <ItemMenu />
      <MoveSheet />
      <DragLayer />
      <ToastHost />
    </InteractCtx.Provider>
  );
}

// ---------------- 操作の実体 ----------------
const KIND_LABEL: Record<ItemKind, string> = { entry: '記録', person: '人', topic: '話題', folder: 'フォルダ' };

export async function deleteItems(store: Store, items: ItemRef[]): Promise<boolean> {
  if (items.length === 0) return false;
  const entries = items.filter((i) => i.kind === 'entry');
  const others = items.filter((i) => i.kind !== 'entry');
  if (others.length) {
    const names = others.map((i) => t('{kind}「{name}」', { kind: t(KIND_LABEL[i.kind]), name: i.label })).slice(0, 5).join('\n');
    const msg =
      names + (others.length > 5 ? '\n' + t('ほか{n}件', { n: others.length - 5 }) : '') + '\n' + t('を削除しますか？') + '\n' +
      (others.some((i) => i.kind === 'folder') ? t('フォルダの中身は消えず、1つ上の階層に移ります。\n') : '') +
      (others.some((i) => i.kind === 'person' || i.kind === 'topic') ? t('人・話題を消しても記録は残ります。') : '');
    if (!confirm(msg)) return false;
  }
  if (entries.length) await store.trashEntries(entries.map((i) => i.id));
  for (const i of others) {
    if (i.kind === 'folder') await store.deleteFolder(i.id);
    else if (i.kind === 'person') await store.deletePerson(i.id);
    else if (i.kind === 'topic') await store.deleteTopic(i.id);
  }
  toast(entries.length && !others.length ? t('「最近削除した項目」に移しました') : t('削除しました'));
  return true;
}

/** フォルダ(または一番上)へ移動。移せないもの(自分の中など)は飛ばす */
export async function moveTo(store: Store, items: ItemRef[], folderId: ID | null, folderName: string) {
  const folders = store.snapshot.folders;
  let moved = 0;
  for (const kind of ['entry', 'person', 'topic', 'folder'] as const) {
    const ids = items
      .filter((i) => i.kind === kind)
      .filter((i) => kind !== 'folder' || (i.id !== folderId && !(folderId && folderDescendants(folders, i.id).has(folderId))))
      .map((i) => i.id);
    if (ids.length) {
      await store.moveItems(kind, ids, folderId);
      moved += ids.length;
    }
  }
  toast(moved ? t('「{name}」に移動しました', { name: folderName }) : t('そこには移動できません'));
}

function ItemMenu() {
  const { ui, close, openMove } = useInteract();
  const store = useStore();
  const data = useData();
  const item = ui.menu;
  if (!item) return null;
  const entry = item.kind === 'entry' ? data.entries.find((e) => e.id === item.id) : undefined;
  const named =
    item.kind === 'person' ? data.people.find((p) => p.id === item.id)
      : item.kind === 'topic' ? data.topics.find((t) => t.id === item.id) : undefined;
  const pinned = entry?.pinned ?? named?.pinned ?? false;
  const act = (fn: () => unknown) => async () => { close(); await fn(); };
  return (
    <Sheet onClose={close} title={item.label}>
      {item.kind !== 'folder' && (
        <button className="sheet-item" onClick={act(async () => {
          await store.setPinned(item.kind as 'entry' | 'person' | 'topic', [item.id], !pinned);
          toast(pinned ? t('ピン留めを外しました') : t('ピン留めしました'));
        })}>
          <span className="ic">📌</span>{pinned ? t('ピン留めを外す') : t('ピン留め')}
        </button>
      )}
      {entry && (
        <>
          <button className="sheet-item" onClick={act(() => copyText(entry.text))}><span className="ic">⧉</span>{t('本文をコピー')}</button>
          {'share' in navigator && (
            <button className="sheet-item" onClick={act(() => navigator.share({ ...(entry.title ? { title: entry.title } : {}), text: entry.title ? `${entry.title}\n${entry.text}` : entry.text }).catch(() => {}))}>
              <span className="ic">↑</span>{t('共有')}
            </button>
          )}
        </>
      )}
      {item.kind === 'folder' && (
        <button className="sheet-item" onClick={act(async () => {
          const name = prompt('フォルダの新しい名前', item.label);
          if (name && name.trim()) await store.renameFolder(item.id, name);
        })}>
          <span className="ic">✎</span>{t('名前を変更')}
        </button>
      )}
      <button className="sheet-item" onClick={() => openMove([item])}><span className="ic">▤</span>{t('フォルダへ移動')}</button>
      <button className="sheet-item danger" onClick={act(() => deleteItems(store, [item]))}><span className="ic">🗑</span>{t('削除')}</button>
    </Sheet>
  );
}

/** 移動先のフォルダを選ぶシート */
function MoveSheet() {
  const { ui, close, clearSel } = useInteract();
  const store = useStore();
  const data = useData();
  const items = ui.move;
  if (!items || items.length === 0) return null;
  const scope = items[0].scope;
  const blocked = new Set<ID>();
  for (const i of items) if (i.kind === 'folder') { blocked.add(i.id); for (const d of folderDescendants(data.folders, i.id)) blocked.add(d); }
  const choices = folderChoices(foldersOf(data.folders, scope)).filter((c) => !blocked.has(c.id));
  const go = async (id: ID | null, name: string) => {
    close();
    clearSel();
    await moveTo(store, items, id, name);
  };
  return (
    <Sheet onClose={close} title={items.length === 1 ? t('「{name}」の移動先', { name: items[0].label }) : t('{n}件の移動先', { n: items.length })}>
      <button className="sheet-item" onClick={() => go(null, t('一番上'))}><span className="ic">⌂</span>{t('一番上')}</button>
      {choices.map((c) => (
        <button key={c.id} className="sheet-item" onClick={() => go(c.id, c.label)}><span className="ic">▤</span>{c.label}</button>
      ))}
      {choices.length === 0 && <p className="muted small pad">{t('移せるフォルダがありません。先にフォルダを作ってください。')}</p>}
    </Sheet>
  );
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        {title && <div className="sheet-title">{title}</div>}
        <div className="sheet-body">{children}</div>
        <button className="sheet-item cancel" onClick={onClose}>{t('キャンセル')}</button>
      </div>
    </div>
  );
}

// ---------------- ドラッグ&ドロップ ----------------
interface Drag { item: ItemRef; x: number; y: number; over: { id: ID | null; name: string } | null; overEl?: HTMLElement | null }
let drag: Drag | null = null;
const dragListeners = new Set<() => void>();
let hotEl: HTMLElement | null = null;
const setDrag = (d: Drag | null) => {
  drag = d;
  // ドロップ先のハイライトはDOMで直接付け外しする
  const el = d?.over ? d.overEl ?? null : null;
  if (hotEl !== el) {
    hotEl?.classList.remove('drop-hot');
    el?.classList.add('drop-hot');
    hotEl = el;
  }
  document.body.classList.toggle('dragging', !!d);
  dragListeners.forEach((l) => l());
};
const useDrag = () => useSyncExternalStore((l) => { dragListeners.add(l); return () => { dragListeners.delete(l); }; }, () => drag);

/** ドロップ先を探す: data-drop(フォルダID or 'root') と data-drop-scope を持つ要素 */
function dropTarget(x: number, y: number, item: ItemRef) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  if (!el || el.dataset.dropScope !== item.scope) return null;
  const id = el.dataset.drop === 'root' ? null : el.dataset.drop!;
  if (item.kind === 'folder' && id === item.id) return null;
  return { id, name: el.dataset.dropName ?? '', el };
}

function DragLayer() {
  const d = useDrag();
  if (!d) return null;
  return (
    <div className="drag-ghost" style={{ left: d.x, top: d.y }}>
      {d.item.kind === 'folder' ? '▤ ' : ''}{d.item.label}
      {d.over && <span className="drag-to">→ {d.over.name}</span>}
    </div>
  );
}

/** ドロップ先の要素につける属性 */
export const dropProps = (scope: FolderScope, id: ID | null, name: string) => ({
  'data-drop': id ?? 'root',
  'data-drop-scope': scope,
  'data-drop-name': name,
});

/**
 * 長押し: 指を離せばメニュー、そのまま動かせばドラッグ。
 * 選択モード中はタップで選択の切り替え。
 */
export function usePress(item: ItemRef, onTap: () => void) {
  const { openMenu, sel, toggle } = useInteract();
  const store = useStore();
  const st = useRef({ timer: 0, x: 0, y: 0, lifted: false, dragging: false, suppress: false, id: -1 });
  const [lifted, setLifted] = useState(false);

  useEffect(() => () => clearTimeout(st.current.timer), []);

  const end = () => {
    clearTimeout(st.current.timer);
    document.removeEventListener('touchmove', block);
    setLifted(false);
  };
  // 持ち上げた後は画面がスクロールしないように
  function block(e: TouchEvent) { if (st.current.lifted) e.preventDefault(); }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = st.current;
    s.x = e.clientX; s.y = e.clientY; s.lifted = false; s.dragging = false; s.suppress = false; s.id = e.pointerId;
    clearTimeout(s.timer);
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    document.addEventListener('touchmove', block, { passive: false });
    s.timer = window.setTimeout(() => {
      s.lifted = true;
      setLifted(true);
      navigator.vibrate?.(8);
    }, 450);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = st.current;
    if (e.pointerId !== s.id) return;
    const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (!s.lifted) {
      if (dist > 10) end();
      return;
    }
    if (!s.dragging && dist > 8) s.dragging = true;
    if (s.dragging) {
      const t = dropTarget(e.clientX, e.clientY, item);
      setDrag({ item, x: e.clientX, y: e.clientY, over: t && { id: t.id, name: t.name }, overEl: t?.el });
    }
  };
  const finish = async (e: React.PointerEvent, cancel = false) => {
    const s = st.current;
    if (e.pointerId !== s.id) return;
    const wasLifted = s.lifted;
    const wasDragging = s.dragging;
    end();
    s.lifted = false;
    if (wasDragging) {
      const over = drag?.over ?? null;
      setDrag(null);
      s.suppress = true;
      if (over && !cancel) {
        const items = sel.active && sel.selected.has(itemKey(item)) ? [...sel.selected.values()] : [item];
        await moveTo(store, items.filter((i) => i.scope === item.scope), over.id, over.name);
      }
    } else if (wasLifted && !cancel) {
      s.suppress = true;
      if (!sel.active) openMenu(item);
    }
  };
  return {
    lifted,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent) => finish(e),
      onPointerCancel: (e: React.PointerEvent) => {
        // スクロールが始まったなどでキャンセルされた
        if (st.current.dragging) return; // ドラッグ中はキャンセル扱いにしない(ポインタは追う)
        finish(e, true);
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        if (!st.current.lifted && !sel.active) openMenu(item);
      },
      onClick: (e: React.MouseEvent) => {
        if (st.current.suppress) { st.current.suppress = false; e.preventDefault(); e.stopPropagation(); return; }
        if (sel.active) toggle(item);
        else onTap();
      },
    },
  };
}

/** 選択モードのチェック丸 */
export function SelectMark({ item }: { item: ItemRef }) {
  const { sel } = useInteract();
  if (!sel.active) return null;
  const on = sel.selected.has(itemKey(item));
  return <span className={`select-mark ${on ? 'on' : ''}`} aria-hidden>{on ? '✓' : ''}</span>;
}

/** 選択モード中、画面下に出す操作バー */
export function SelectionBar({ all }: { all: ItemRef[] }) {
  const { sel, clearSel, openMove, toggle } = useInteract();
  const store = useStore();
  if (!sel.active) return null;
  const items = [...sel.selected.values()];
  const n = items.length;
  const pinnable = items.filter((i) => i.kind !== 'folder');
  const allSelected = n > 0 && n === all.length;
  return (
    <div className="select-bar">
      <button className="link" onClick={() => {
        if (allSelected) items.forEach(toggle);
        else all.forEach((i) => { if (!sel.selected.has(itemKey(i))) toggle(i); });
      }}>{allSelected ? t('選択解除') : t('すべて選択')}</button>
      <span className="muted small">{t('{n}件選択', { n })}</span>
      <div className="select-actions">
        <button className="link" disabled={!pinnable.length} onClick={async () => {
          const kind = pinnable[0].kind as 'entry' | 'person' | 'topic';
          await store.setPinned(kind, pinnable.map((i) => i.id), true);
          toast('ピン留めしました');
          clearSel();
        }}>📌</button>
        <button className="link" disabled={!n} onClick={() => openMove(items)}>{t('移動')}</button>
        <button className="link danger" disabled={!n} onClick={async () => { if (await deleteItems(store, items)) clearSel(); }}>{t('削除')}</button>
      </div>
    </div>
  );
}

/** 選択ボタン(ヘッダー用) */
export function SelectButton() {
  const { sel, setSelecting } = useInteract();
  return (
    <button className="link small-link" onClick={() => setSelecting(!sel.active)}>
      {sel.active ? t('完了') : t('選択')}
    </button>
  );
}

/** パス表記 */
export const folderLabel = (folders: Parameters<typeof folderPath>[0], id: ID | null) =>
  id ? folderPath(folders, id).map((f) => f.name).join(' / ') : t('一番上');
