import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { FolderScope, ID } from '../core/types';
import type { Store } from '../core/store';
import { foldersOf, folderDescendants, folderPath } from '../core/store';
import { folderChoices } from './folders';
import { useData, useStore } from './hooks';
import { t } from '../i18n';
import { useFeatures } from './features';

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
  /** 中の記録をまとめて削除するフォルダ */
  clear: ID | null;
  /** グループに入れる人 */
  group?: ItemRef[] | null;
}
interface SelectState {
  active: boolean;
  selected: Map<string, ItemRef>;
}
interface Ctx {
  ui: UiState;
  openMenu: (i: ItemRef) => void;
  openMove: (items: ItemRef[]) => void;
  openClear: (folderId: ID) => void;
  openGroup: (people: ItemRef[]) => void;
  close: () => void;
  sel: SelectState;
  setSelecting: (on: boolean) => void;
  toggle: (i: ItemRef) => void;
  clearSel: () => void;
}
const InteractCtx = createContext<Ctx>(null!);
export const useInteract = () => useContext(InteractCtx);

export function InteractProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiState>({ menu: null, move: null, clear: null });
  const [sel, setSel] = useState<SelectState>({ active: false, selected: new Map() });
  // 画面を移動したら選択モードを終える
  useEffect(() => {
    const on = () => setSel({ active: false, selected: new Map() });
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const ctx: Ctx = {
    ui,
    openMenu: (i) => setUi({ menu: i, move: null, clear: null }),
    openMove: (items) => setUi({ menu: null, move: items, clear: null }),
    openClear: (id) => setUi({ menu: null, move: null, clear: id }),
    openGroup: (people) => setUi({ menu: null, move: null, clear: null, group: people }),
    close: () => setUi({ menu: null, move: null, clear: null }),
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
      <ClearSheet />
      <GroupSheet />
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
  const { ui, close, openMove, openClear, openGroup } = useInteract();
  const store = useStore();
  const data = useData();
  const feat = useFeatures();
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
      {item.kind === 'person' && feat.groups && (
        <button className="sheet-item" onClick={() => openGroup([item])}><span className="ic">👥</span>{t('グループに追加')}</button>
      )}
      {feat.folders && <button className="sheet-item" onClick={() => openMove([item])}><span className="ic">▤</span>{t('フォルダへ移動')}</button>}
      {item.kind === 'folder' && item.scope === 'entry' && (
        <button className="sheet-item danger" onClick={() => openClear(item.id)}><span className="ic">🗑</span>{t('中の記録をすべて削除')}</button>
      )}
      <button className="sheet-item danger" onClick={act(() => deleteItems(store, [item]))}><span className="ic">🗑</span>{item.kind === 'folder' ? t('フォルダを削除') : t('削除')}</button>
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

/**
 * 人をグループに入れる・外すシート。グループをタップするたびに入れたり外したりでき、
 * 新しいグループもその場で作れる(複数人を選んでいるときは全員まとめて)
 */
function GroupSheet() {
  const { ui, close, clearSel } = useInteract();
  const store = useStore();
  const data = useData();
  const [name, setName] = useState('');
  const people = ui.group;
  if (!people || people.length === 0) return null;
  const ids = people.map((p) => p.id);
  const inAll = (gid: ID) => ids.every((id) => data.people.find((p) => p.id === id)?.groupIds?.includes(gid));
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const done = () => { close(); clearSel(); setName(''); };
  const create = async () => {
    if (!name.trim()) return;
    const g = await store.addGroup(name);
    await store.setGroupMembers(g.id, ids, true);
    setName('');
    toast(t('「{name}」に追加しました', { name: g.name }));
  };
  return (
    <Sheet onClose={done} title={people.length === 1 ? t('「{name}」を入れるグループ', { name: people[0].label }) : t('{n}人を入れるグループ', { n: people.length })}>
      {groups.map((g) => {
        const on = inAll(g.id);
        return (
          <button key={g.id} className="sheet-item" onClick={async () => {
            await store.setGroupMembers(g.id, ids, !on);
            toast(on ? t('「{name}」から外しました', { name: g.name }) : t('「{name}」に追加しました', { name: g.name }));
          }}>
            <span className="ic check">{on ? '✓' : ''}</span>{g.name}
          </button>
        );
      })}
      <div className="sheet-item sheet-input">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('新しいグループの名前')}
          enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); create(); } }}
        />
        <button className="btn small" disabled={!name.trim()} onClick={create}>{t('作成')}</button>
      </div>
      <button className="sheet-item strong" onClick={done}>{t('完了')}</button>
    </Sheet>
  );
}

/** フォルダ内の記録をまとめて削除する確認シート(件数を出し、中のフォルダを含めるか選ぶ) */
function ClearSheet() {
  const { ui, close, clearSel } = useInteract();
  const store = useStore();
  const data = useData();
  const id = ui.clear;
  const folder = id ? data.folders.find((f) => f.id === id) : undefined;
  if (!id || !folder) return null;
  const direct = store.folderEntryIds(id, false).length;
  const deep = store.folderEntryIds(id, true).length;
  const run = async (inner: boolean) => {
    close();
    clearSel();
    const n = await store.trashFolderEntries(id, inner);
    toast(t('{n}件を「最近削除した項目」に移しました', { n }));
  };
  return (
    <Sheet onClose={close} title={t('「{name}」の記録をすべて削除', { name: folder.name })}>
      <p className="muted small sheet-note">{t('記録は「最近削除した項目」に移り、30日間は戻せます。フォルダは残ります。')}</p>
      {deep === 0 ? (
        <p className="muted small sheet-note">{t('削除する記録はありません')}</p>
      ) : deep === direct ? (
        <button className="sheet-item danger" onClick={() => run(false)}><span className="ic">🗑</span>{t('{n}件の記録を削除', { n: direct })}</button>
      ) : (
        <>
          {direct > 0 && (
            <button className="sheet-item danger" onClick={() => run(false)}><span className="ic">🗑</span>{t('このフォルダの記録だけ削除（{n}件）', { n: direct })}</button>
          )}
          <button className="sheet-item danger" onClick={() => run(true)}><span className="ic">🗑</span>{t('中のフォルダの記録も削除（{n}件）', { n: deep })}</button>
        </>
      )}
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
interface Drag { item: ItemRef; x: number; y: number; over: { id: ID | null; name: string; group?: boolean } | null; overEl?: HTMLElement | null }
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
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop],[data-drop-group]');
  // 人はグループのチップにも落とせる(グループに追加。フォルダは変わらない)
  if (el?.dataset.dropGroup) return item.kind === 'person' ? { id: el.dataset.dropGroup, name: el.dataset.dropName ?? '', el, group: true } : null;
  if (!el || el.dataset.dropScope !== item.scope) return null;
  const id = el.dataset.drop === 'root' ? null : el.dataset.drop!;
  if (item.kind === 'folder' && id === item.id) return null;
  return { id, name: el.dataset.dropName ?? '', el };
}

function DragLayer() {
  const d = useDrag();
  // 念のため: 指/マウスを離した後や画面を離れた後にドラッグ表示が残っていたら消す
  useEffect(() => {
    if (!d) return;
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = window.setTimeout(() => { if (drag) setDrag(null); }, 300); };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length === 0) later(); };
    const now = () => { if (drag) setDrag(null); };
    const onVis = () => { if (document.hidden) now(); };
    addEventListener('pointerup', later, true);
    addEventListener('touchend', onTouchEnd, true);
    addEventListener('hashchange', now);
    addEventListener('blur', now);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(timer);
      removeEventListener('pointerup', later, true);
      removeEventListener('touchend', onTouchEnd, true);
      removeEventListener('hashchange', now);
      removeEventListener('blur', now);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [!!d]);
  if (!d) return null;
  return (
    <div className="drag-ghost" style={{ left: d.x, top: d.y }}>
      {d.item.kind === 'folder' ? '▤ ' : ''}{d.item.label}
      {d.over && <span className="drag-to">{d.over.group ? '＋' : '→'} {d.over.name}</span>}
    </div>
  );
}

/** ドロップ先の要素につける属性 */
/** 人を落とせるグループのチップにつける属性 */
export const groupDropProps = (id: ID, name: string) => ({ 'data-drop-group': id, 'data-drop-name': name });

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
  // 最新の値をドキュメントのリスナーから使えるように
  const latest = useRef({ item, sel });
  latest.current = { item, sel };
  // ドキュメントに付けるリスナーは描画をまたいで同じ関数にする(外し漏れを防ぐ)
  const impl = useRef({ move: (_e: TouchEvent) => {}, end: (_e: TouchEvent) => {}, cancel: () => {} });
  const L = useRef({
    block: (e: TouchEvent) => { if (st.current.lifted) e.preventDefault(); },
    move: (e: TouchEvent) => impl.current.move(e),
    end: (e: TouchEvent) => impl.current.end(e),
    cancel: () => impl.current.cancel(),
  }).current;

  const end = () => {
    clearTimeout(st.current.timer);
    // 持ち上げた後は画面がスクロールしないように付けていたもの
    document.removeEventListener('touchmove', L.block);
    document.removeEventListener('touchmove', L.move);
    document.removeEventListener('touchend', L.end);
    document.removeEventListener('touchcancel', L.cancel);
    setLifted(false);
  };

  // 画面から消えたら(フォルダを開いた・データが更新された等)ドラッグ表示も片付ける
  useEffect(() => () => {
    const s = st.current;
    if (s.dragging && drag) setDrag(null);
    s.lifted = false; s.dragging = false;
    end();
  }, []);

  const moveAt = (x: number, y: number) => {
    const s = st.current;
    const dist = Math.hypot(x - s.x, y - s.y);
    if (!s.lifted) {
      if (dist > 10) end();
      return;
    }
    if (!s.dragging && dist > 8) s.dragging = true;
    if (s.dragging) {
      const it = latest.current.item;
      const t = dropTarget(x, y, it);
      setDrag({ item: it, x, y, over: t && { id: t.id, name: t.name, group: 'group' in t }, overEl: t?.el });
    }
  };
  const finishNow = async (cancel: boolean) => {
    const s = st.current;
    const wasLifted = s.lifted;
    const wasDragging = s.dragging;
    end();
    s.lifted = false;
    s.dragging = false;
    s.id = -1;
    if (wasDragging) {
      const over = drag?.over ?? null;
      setDrag(null);
      s.suppress = true;
      if (over && !cancel) {
        const { item: it, sel: sl } = latest.current;
        const items = sl.active && sl.selected.has(itemKey(it)) ? [...sl.selected.values()] : [it];
        if (over.group && over.id) {
          const people = items.filter((i) => i.kind === 'person').map((i) => i.id);
          await store.setGroupMembers(over.id, people, true);
          toast(t('「{name}」に追加しました', { name: over.name }));
        } else await moveTo(store, items.filter((i) => i.scope === it.scope), over.id, over.name);
      }
    } else if (wasLifted && !cancel) {
      s.suppress = true;
      if (!latest.current.sel.active) openMenu(latest.current.item);
    }
  };
  // iPhoneでは長押し中にポインタが取り消される(pointercancel)ことがあり、その後 pointerup が来ない。
  // そうなったらタッチイベントで指を追い、指を離した時点でドロップ/片付けをする。
  impl.current = {
    move: (e) => {
      const p = e.touches[0];
      if (!p) return;
      if (st.current.lifted && e.cancelable) e.preventDefault();
      moveAt(p.clientX, p.clientY);
    },
    end: (e) => { if (e.touches.length === 0) void finishNow(false); },
    cancel: () => { void finishNow(true); },
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const s = st.current;
    s.x = e.clientX; s.y = e.clientY; s.lifted = false; s.dragging = false; s.suppress = false; s.id = e.pointerId;
    clearTimeout(s.timer);
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    document.addEventListener('touchmove', L.block, { passive: false });
    s.timer = window.setTimeout(() => {
      s.lifted = true;
      setLifted(true);
      navigator.vibrate?.(8);
    }, 450);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== st.current.id) return;
    moveAt(e.clientX, e.clientY);
  };
  const finish = (e: React.PointerEvent, cancel = false) => {
    if (e.pointerId !== st.current.id) return;
    void finishNow(cancel);
  };
  return {
    lifted,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent) => finish(e),
      onPointerCancel: (e: React.PointerEvent) => {
        const s = st.current;
        if (e.pointerId !== s.id) return;
        if (s.lifted && e.pointerType === 'touch') {
          // 持ち上げ済みならタッチイベントで続きを追う(指を離せば必ず終わる)
          s.id = -1;
          document.addEventListener('touchmove', L.move, { passive: false });
          document.addEventListener('touchend', L.end);
          document.addEventListener('touchcancel', L.cancel);
          return;
        }
        // スクロールが始まったなどでキャンセルされた
        void finishNow(true);
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
export function SelectionBar({ all, folderId }: { all: ItemRef[]; /** 記録のフォルダ内なら、未選択時に「すべて削除」を出す */ folderId?: ID | null }) {
  const { sel, clearSel, openMove, toggle, openClear, openGroup } = useInteract();
  const store = useStore();
  const feat = useFeatures();
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
        {feat.groups && all.some((i) => i.kind === 'person') && (
          <button className="link" disabled={!n || items.some((i) => i.kind !== 'person')} onClick={() => openGroup(items)}>{t('グループ')}</button>
        )}
        {feat.folders && <button className="link" disabled={!n} onClick={() => openMove(items)}>{t('移動')}</button>}
        {!n && folderId ? (
          <button className="link danger" onClick={() => openClear(folderId)}>{t('すべて削除')}</button>
        ) : (
          <button className="link danger" disabled={!n} onClick={async () => { if (await deleteItems(store, items)) clearSel(); }}>{t('削除')}</button>
        )}
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
