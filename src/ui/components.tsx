import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { entryLabel, entryPreview, type AppData, type Entry, type Group, type ID, type Person } from '../core/types';
import { nameMatches, normalize } from '../core/search';
import { folderPath } from '../core/store';
import { formatDate, go, useStore } from './hooks';
import { useFeatures } from './features';
import { copyText, reorderProps, SelectMark, toast, useInteract, usePress, useReorderList, type ItemRef } from './interact';
import { t } from '../i18n';

/** lead: 見出し行の左端に並べるアイコン(お気に入り・すべて など)。戻るボタンより左に出す */
export function Header({ title, left, right, lead }: { title: ReactNode; left?: ReactNode; right?: ReactNode; lead?: ReactNode }) {
  return (
    <header className="header">
      <div className={`header-side ${lead ? 'with-lead' : ''}`}>{lead}{left}</div>
      <h1 className="header-title">{title}</h1>
      <div className="header-side right">{right}</div>
    </header>
  );
}

/** お気に入りの☆/★。ワンタップで入れる・外す。一覧の行の中でも押せる(長押し・タップの判定に渡さない) */
export function FavButton({ on, onToggle, className = '' }: { on: boolean; onToggle: () => void; className?: string }) {
  if (!useFeatures().favorites) return null;
  return (
    <button
      type="button"
      className={`fav-btn ${on ? 'on' : ''} ${className}`}
      aria-label={on ? t('お気に入りから外す') : t('お気に入りに追加')}
      aria-pressed={on}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

/** 保存済みの話題・人・タグのお気に入りを切り替えるボタン */
export function FavToggle({ kind, id, on, className }: { kind: 'entry' | 'person' | 'topic'; id: ID; on: boolean; className?: string }) {
  const store = useStore();
  return (
    <FavButton
      on={on}
      className={className}
      onToggle={async () => {
        await store.setFavorite(kind, [id], !on);
        toast(on ? t('お気に入りから外しました') : t('お気に入りに追加しました'));
      }}
    />
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search">
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        enterKeyHint="search"
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label={t('クリア')}>
          ×
        </button>
      )}
    </div>
  );
}

/** 話題の見出し1行+続き1行(はみ出しは「…」)。続きがなければ見出しを2行まで折り返す */
export function EntryPreview({ entry, pinned }: { entry: Entry; pinned?: boolean }) {
  const { head, rest } = entryPreview(entry);
  // タイトルがない時は本文の冒頭なので太字にしない
  const plain = !entry.title?.trim();
  return (
    <>
      <div className={`card-head ${rest ? '' : 'two'} ${head ? '' : 'muted'} ${plain ? 'plain' : ''}`}>
        {pinned && <span className="pin" aria-label={t('ピン留め')}>📌</span>}
        {head || t('（本文なし）')}
      </div>
      {rest && <div className="card-rest">{rest}</div>}
    </>
  );
}

export function EntryCard({ entry, data, hidePersonId, hideTopicId, hideFolder, list }: {
  entry: Entry;
  /** 手動の並び順の一覧(useReorderList のキー) */
  list?: string;
  data: AppData;
  hidePersonId?: ID;
  hideTopicId?: ID;
  hideFolder?: boolean;
}) {
  const people = entry.personIds
    .filter((id) => id !== hidePersonId)
    .map((id) => data.people.find((p) => p.id === id))
    .filter(Boolean);
  const topics = entry.topics
    .filter((t) => t.topicId !== hideTopicId)
    .map((t) => data.topics.find((x) => x.id === t.topicId))
    .filter(Boolean);
  const feat = useFeatures();
  const groups = feat.groups ? (entry.groupIds ?? []).map((id) => data.groups.find((g) => g.id === id)).filter(Boolean) : [];
  const hints = sameNameHints(data.people, data.groups);
  const folder = !hideFolder && feat.folders && entry.folderId ? data.folders.find((f) => f.id === entry.folderId) : undefined;
  const item: ItemRef = { kind: 'entry', id: entry.id, label: entryLabel(entry, 24) || t('（本文なし）'), scope: 'entry' };
  const { lifted, handlers } = usePress(item, () => go(`/edit/${entry.id}`));
  const { sel } = useInteract();
  return (
    <article className={`card ${lifted ? 'lifted' : ''} ${sel.active ? 'selecting' : ''}`} {...reorderProps(list, 'entry', entry.id)} {...handlers}>
      <SelectMark item={item} />
      <EntryPreview entry={entry} pinned={entry.pinned} />
      {!sel.active && <FavToggle kind="entry" id={entry.id} on={!!entry.favorite} />}
      {!sel.active && feat.copy && (
        <button
          className="copy-btn"
          aria-label={t('本文をコピー')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); copyText(entry.text, e.currentTarget); }}
        >
          ⧉
        </button>
      )}
      <div className="card-meta">
        <span className="date">{formatDate(entry.talkedOn)}</span>
        {feat.images && !!entry.imageIds?.length && <span className="img-count" aria-label={t('画像{n}枚', { n: entry.imageIds.length })}>🖼 {entry.imageIds.length}</span>}
        {folder && <span className="chip folder small">▤ {folderPath(data.folders, folder.id).map((f) => f.name).join(' / ')}</span>}
        {groups.map((g) => (
          <span key={g!.id} className="chip group small">{g!.name}</span>
        ))}
        {people.map((p) => (
          <span key={p!.id} className="chip person small">{p!.name}{hints.get(p!.id) && <span className="hint">（{hints.get(p!.id)}）</span>}</span>
        ))}
        {topics.map((t) => (
          <span key={t!.id} className="chip topic small">#{t!.name}</span>
        ))}
      </div>
    </article>
  );
}

export function EntryList({ entries, data, empty, hidePersonId, hideTopicId, hideFolder, pinSplit, reorder }: {
  entries: Entry[];
  /** 手動の並び順のとき true(長押しして上下に動かすと並べ替え) */
  reorder?: boolean;
  data: AppData;
  empty: ReactNode;
  hidePersonId?: ID;
  hideTopicId?: ID;
  hideFolder?: boolean;
  /** ピン留めを上に分けて表示する */
  pinSplit?: boolean;
}) {
  const [limit, more] = useIncremental(entries.length);
  const split = pinSplit && entries.some((e) => e.pinned);
  const list = useReorderList(reorder && !split ? entries.map((e) => e.id) : null);
  if (split) {
    const pinned = entries.filter((e) => e.pinned);
    const rest = entries.filter((e) => !e.pinned);
    const props = { data, hidePersonId, hideTopicId, hideFolder, reorder };
    return (
      <>
        <div className="section-title">{t('📌 ピン留め')}</div>
        <EntryList entries={pinned} empty="" {...props} />
        {rest.length > 0 && <div className="section-title">{t('話題')}</div>}
        {rest.length > 0 && <EntryList entries={rest} empty="" {...props} />}
      </>
    );
  }
  if (entries.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="list">
      {entries.slice(0, limit).map((e) => (
        <EntryCard key={e.id} entry={e} data={data} hidePersonId={hidePersonId} hideTopicId={hideTopicId} hideFolder={hideFolder} list={list} />
      ))}
      {limit < entries.length && <LoadMore onVisible={more} rest={entries.length - limit} />}
    </div>
  );
}

export const PAGE_SIZE = 30;

/** 最初は PAGE_SIZE 件だけ表示し、下までスクロールしたら追加で表示する */
export function useIncremental(total: number): [number, () => void] {
  const [limit, setLimit] = useState(PAGE_SIZE);
  // 一覧が大きく縮んだ(検索など)ときは最初に戻す
  useEffect(() => {
    if (total <= PAGE_SIZE) setLimit(PAGE_SIZE);
  }, [total]);
  return [limit, () => setLimit((l) => Math.min(l + PAGE_SIZE, Math.max(total, PAGE_SIZE)))];
}

export function LoadMore({ onVisible, rest }: { onVisible: () => void; rest: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) cb.current(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rest]);
  return (
    <div ref={ref} className="load-more">
      <button className="link" onClick={onVisible}>{t('さらに表示（残り{n}件）', { n: rest })}</button>
    </div>
  );
}

/** 並べ替えの選択(ネイティブのドロップダウン) */
export function SortSelect<K extends string>({ value, options, onChange }: {
  value: K;
  options: { key: K; label: string }[];
  onChange: (k: K) => void;
}) {
  return (
    <label className="sort">
      <span aria-hidden>⇅</span>
      <select value={value} onChange={(e) => {
        const k = e.target.value as K;
        onChange(k);
        // 手動の並び順は長押しで動かすことを知らないと使えないので、選んだときに伝える
        if (k === 'manual') toast(t('行を長押しして上下に動かすと並べ替えられます'), 3500);
      }} aria-label={t('並べ替え')}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{t(o.label)}</option>
        ))}
      </select>
    </label>
  );
}
/** 話題の相手に出す人のグループ。選ぶとグループそのものが話題に付く(メンバーには展開しない) */
export interface PickGroup { id: ID; name: string; rank: number; count: number }

/** 候補の最初の表示数。横にスクロールして端まで行くと、同じ数ずつ追加で出す */
export const PICK_PAGE = 15;

const hintCache = new WeakMap<Person[], Map<ID, string>>();
/**
 * 同じ名前の人が複数いるとき、見分けるための補足(グループ名・メモの先頭・追加した日)。
 * 同名の人がいない人は入らない。
 */
export function sameNameHints(people: Person[], groups: Group[]): Map<ID, string> {
  const cached = hintCache.get(people);
  if (cached) return cached;
  const byName = new Map<string, Person[]>();
  for (const p of people) {
    const k = normalize(p.name.trim());
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const gName = new Map(groups.map((g) => [g.id, g.name]));
  const out = new Map<ID, string>();
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    for (const p of list) {
      const gs = (p.groupIds ?? []).map((g) => gName.get(g)).filter(Boolean).join('・');
      const memo = p.memo.trim().split('\n')[0].slice(0, 12);
      const d = new Date(p.createdAt);
      out.set(p.id, gs || memo || t('{m}/{d}に追加', { m: d.getMonth() + 1, d: d.getDate() }));
    }
  }
  hintCache.set(people, out);
  return out;
}

/**
 * スマホでは入力欄の下の候補がキーボードに隠れてしまうので、
 * 入力欄をタップしたら画面の上の方までスクロールして候補が見えるようにする。
 */
function liftAboveKeyboard(el: HTMLElement) {
  if (typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches) return;
  setTimeout(() => {
    const top = el.getBoundingClientRect().top;
    if (top > 80) window.scrollBy({ top: top - 72, behavior: 'smooth' });
  }, 300);
}

/** 横スクロールの候補の列。端の目印が見えたら onMore で追加表示する */
/** wrap: 絞り込み中は折り返して全部見えるように(多いときは縦にスクロール) */
function PickRow({ children, more, onMore, resetKey, wrap }: { children: ReactNode; more: boolean; onMore: () => void; resetKey: string; wrap?: boolean }) {
  const row = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLSpanElement>(null);
  const cb = useRef(onMore);
  cb.current = onMore;
  useEffect(() => { row.current?.scrollTo?.({ left: 0, top: 0 }); }, [resetKey]);
  useEffect(() => {
    if (!more || !end.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) cb.current(); }, { root: row.current, rootMargin: '0px 120px 60px 0px' });
    io.observe(end.current);
    return () => io.disconnect();
  });
  return (
    <div className={`chips quick ${wrap ? 'wrap' : ''}`} ref={row}>
      {children}
      {more && <span ref={end} className="pick-more" aria-hidden>…</span>}
    </div>
  );
}

/**
 * 人・タグの選択。ドロップダウンは出さず、入力欄の下に候補を並べてタップで選ぶ。
 * 候補は最後に選んだ順に {PICK_PAGE} 件ずつ。横にスクロールすると追加で出る。
 * 入力すると候補が絞り込まれ、先頭に「新しく追加」が出る(新規は話題の保存時に作られる)。
 * 人のときはグループの列も出し、グループを選ぶとグループ自体が付く。
 */
export function ComboPicker({ kind, options, selected, newNames, onChange, groups = [], selectedGroups = [], onGroupsChange, suggest = true, allowSameName = false }: {
  kind: 'person' | 'topic';
  options: { id: ID; name: string; reading?: string; rank: number; hint?: string }[];
  selected: ID[];
  newNames: string[];
  onChange: (selected: ID[], newNames: string[]) => void;
  /** 人のグループ。候補の2列目に出す */
  groups?: PickGroup[];
  selectedGroups?: ID[];
  onGroupsChange?: (ids: ID[]) => void;
  /** 何も入力していないときも候補を出すか(オフなら入力したときだけ) */
  suggest?: boolean;
  /** 同じ名前がすでにあっても「別の人として追加」できるようにする */
  allowSameName?: boolean;
}) {
  const [q, setQ] = useState('');
  const prefix = kind === 'topic' ? '#' : '';
  const clean = q.trim().replace(/^#/, '');
  const nq = normalize(clean);
  // 並び順は画面を開いた時点で固定(選ぶたびに並びが変わらないように)
  const [rank0] = useState(() => new Map([...options.map((o) => [o.id, o.rank] as const), ...groups.map((g) => [g.id, g.rank] as const)]));
  const rankOf = (x: { id: ID; rank: number }) => rank0.get(x.id) ?? x.rank;
  const [limit, setLimit] = useState(PICK_PAGE);
  const [glimit, setGlimit] = useState(PICK_PAGE);
  useEffect(() => { setLimit(PICK_PAGE); setGlimit(PICK_PAGE); }, [nq]);

  const items = useMemo(
    () => options.filter((o) => !selected.includes(o.id) && (!nq || nameMatches(o, clean))).sort((a, b) => rankOf(b) - rankOf(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, selected, nq],
  );
  const groupItems = useMemo(
    () => groups.filter((g) => !selectedGroups.includes(g.id) && (!nq || normalize(g.name).includes(nq))).sort((a, b) => rankOf(b) - rankOf(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, selectedGroups, nq],
  );
  const sameExists = options.some((o) => normalize(o.name) === nq);
  const sameNew = newNames.some((n) => normalize(n) === nq);
  const canAdd = !!clean && (allowSameName ? true : !sameExists && !sameNew);
  const showRows = suggest || !!clean;

  const toggle = (id: ID) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], newNames);
  const toggleGroup = (id: ID) =>
    onGroupsChange?.(selectedGroups.includes(id) ? selectedGroups.filter((x) => x !== id) : [...selectedGroups, id]);
  const addNew = () => {
    if (!clean) return;
    onChange(selected, [...newNames, clean]);
    setQ('');
  };
  /** Enter: 同じ名前の候補があればそれを選び、なければ新しく追加 */
  const enter = () => {
    if (!clean) return;
    const found = items.find((o) => normalize(o.name) === nq);
    if (found) { toggle(found.id); setQ(''); return; }
    if (options.some((o) => normalize(o.name) === nq && selected.includes(o.id)) || sameNew) { setQ(''); return; }
    addNew();
  };
  const addChip = (
    <button type="button" className={`chip ${kind} add`} onClick={addNew}>
      {sameExists || sameNew
        ? t('＋「{name}」を別の人として追加', { name: clean })
        : t('＋「{name}」を新しく追加', { name: prefix + clean })}
    </button>
  );
  const groupName = (id: ID) => groups.find((g) => g.id === id)?.name ?? '?';

  return (
    <div className="picker">
      {(selected.length > 0 || newNames.length > 0 || selectedGroups.length > 0) && (
        <div className="chips">
          {selectedGroups.map((id) => (
            <button key={'g:' + id} type="button" className="chip group on" onClick={() => toggleGroup(id)}>
              <span className="group-mark">{t('グループ')}</span>{groupName(id)} <span className="x">×</span>
            </button>
          ))}
          {selected.map((id) => {
            const o = options.find((x) => x.id === id);
            return (
              <button key={id} type="button" className={`chip ${kind} on`} onClick={() => toggle(id)}>
                {prefix}{o?.name ?? '?'}{o?.hint && <span className="hint">（{o.hint}）</span>} <span className="x">×</span>
              </button>
            );
          })}
          {newNames.map((n, i) => (
            <button key={'new:' + i + n} type="button" className={`chip ${kind} on`} onClick={() => onChange(selected, newNames.filter((_, j) => j !== i))}>
              {prefix}{n} <span className="new">{t('新規')}</span> <span className="x">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="combo">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => liftAboveKeyboard(e.currentTarget)}
          placeholder={kind === 'person' ? t('🔍 名前で絞り込む／新しい人を入力') : t('🔍 タグで絞り込む／新しいタグを入力')}
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enter();
            }
          }}
        />
        {q && <button type="button" className="combo-clear" aria-label={t('入力を消す')} onClick={() => setQ('')}>×</button>}
      </div>
      {showRows && (canAdd || items.length > 0) && (
        <PickRow more={items.length > limit} onMore={() => setLimit((l) => l + PICK_PAGE)} resetKey={nq} wrap={!!nq}>
          {canAdd && !(sameExists || sameNew) && addChip}
          {items.slice(0, limit).map((o) => (
            <button key={o.id} type="button" className={`chip ${kind}`} onClick={() => { toggle(o.id); setQ(''); }}>
              ＋ {prefix}{o.name}{o.hint && <span className="hint">（{o.hint}）</span>}
            </button>
          ))}
          {/* 同じ名前の人がいるときは、まず既存の人を出し、「別の人として追加」は後ろに */}
          {canAdd && (sameExists || sameNew) && addChip}
        </PickRow>
      )}
      {showRows && groupItems.length > 0 && (
        <PickRow more={groupItems.length > glimit} onMore={() => setGlimit((l) => l + PICK_PAGE)} resetKey={nq} wrap={!!nq}>
          {groupItems.slice(0, glimit).map((g) => (
            <button key={'g:' + g.id} type="button" className="chip group" onClick={() => { toggleGroup(g.id); setQ(''); }}>
              ＋ <span className="group-mark">{t('グループ')}</span>{g.name} <span className="n">{t('{n}人', { n: g.count })}</span>
            </button>
          ))}
        </PickRow>
      )}
      {!clean && suggest && options.length === 0 && groups.length === 0 && (
        <p className="muted small pick-empty">{t('まだありません。名前を入力すると追加できます')}</p>
      )}
    </div>
  );
}
