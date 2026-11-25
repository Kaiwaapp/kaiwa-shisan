import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { entryLabel, entryPreview, type AppData, type Entry, type ID } from '../core/types';
import { nameMatches, normalize } from '../core/search';
import { folderPath } from '../core/store';
import { formatDate, go } from './hooks';
import { copyText, SelectMark, useInteract, usePress, type ItemRef } from './interact';
import { t } from '../i18n';

export function Header({ title, left, right }: { title: ReactNode; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="header">
      <div className="header-side">{left}</div>
      <h1 className="header-title">{title}</h1>
      <div className="header-side right">{right}</div>
    </header>
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

/** 記録の見出し1行+続き1行(はみ出しは「…」)。続きがなければ見出しを2行まで折り返す */
export function EntryPreview({ entry, pinned }: { entry: Entry; pinned?: boolean }) {
  const { head, rest } = entryPreview(entry);
  return (
    <>
      <div className={`card-head ${rest ? '' : 'two'} ${head ? '' : 'muted'}`}>
        {pinned && <span className="pin" aria-label={t('ピン留め')}>📌</span>}
        {head || t('（本文なし）')}
      </div>
      {rest && <div className="card-rest">{rest}</div>}
    </>
  );
}

export function EntryCard({ entry, data, hidePersonId, hideTopicId, hideFolder }: {
  entry: Entry;
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
  const folder = !hideFolder && entry.folderId ? data.folders.find((f) => f.id === entry.folderId) : undefined;
  const item: ItemRef = { kind: 'entry', id: entry.id, label: entryLabel(entry, 24) || t('（本文なし）'), scope: 'entry' };
  const { lifted, handlers } = usePress(item, () => go(`/edit/${entry.id}`));
  const { sel } = useInteract();
  return (
    <article className={`card ${lifted ? 'lifted' : ''} ${sel.active ? 'selecting' : ''}`} {...handlers}>
      <SelectMark item={item} />
      <EntryPreview entry={entry} pinned={entry.pinned} />
      {!sel.active && (
        <button
          className="copy-btn"
          aria-label={t('本文をコピー')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); copyText(entry.text); }}
        >
          ⧉
        </button>
      )}
      <div className="card-meta">
        <span className="date">{formatDate(entry.talkedOn)}</span>
        {folder && <span className="chip folder small">▤ {folderPath(data.folders, folder.id).map((f) => f.name).join(' / ')}</span>}
        {people.map((p) => (
          <span key={p!.id} className="chip person small">{p!.name}</span>
        ))}
        {topics.map((t) => (
          <span key={t!.id} className="chip topic small">#{t!.name}</span>
        ))}
      </div>
    </article>
  );
}

export function EntryList({ entries, data, empty, hidePersonId, hideTopicId, hideFolder, pinSplit }: {
  entries: Entry[];
  data: AppData;
  empty: ReactNode;
  hidePersonId?: ID;
  hideTopicId?: ID;
  hideFolder?: boolean;
  /** ピン留めを上に分けて表示する */
  pinSplit?: boolean;
}) {
  const [limit, more] = useIncremental(entries.length);
  if (pinSplit && entries.some((e) => e.pinned)) {
    const pinned = entries.filter((e) => e.pinned);
    const rest = entries.filter((e) => !e.pinned);
    const props = { data, hidePersonId, hideTopicId, hideFolder };
    return (
      <>
        <div className="section-title">{t('📌 ピン留め')}</div>
        <EntryList entries={pinned} empty="" {...props} />
        {rest.length > 0 && <div className="section-title">{t('記録')}</div>}
        {rest.length > 0 && <EntryList entries={rest} empty="" {...props} />}
      </>
    );
  }
  if (entries.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="list">
      {entries.slice(0, limit).map((e) => (
        <EntryCard key={e.id} entry={e} data={data} hidePersonId={hidePersonId} hideTopicId={hideTopicId} hideFolder={hideFolder} />
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
      <select value={value} onChange={(e) => onChange(e.target.value as K)} aria-label={t('並べ替え')}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>{t(o.label)}</option>
        ))}
      </select>
    </label>
  );
}

/** 選択肢に混ぜて出す人のグループ。選ぶとメンバー全員が相手に入る */
export interface PickGroup { id: ID; name: string; memberIds: ID[] }

/**
 * 人・話題の選択。入力欄の下に直近の人・話題(とグループ)が並び、ドロップダウンを開かずに選べる。
 * 入力欄をタップすると既存の候補がドロップダウンで出る(人のときはグループも混ぜて出す)。
 * 候補にない名前は「新しく追加」で仮登録し、記録の保存時に作られる。
 */
export function ComboPicker({ kind, options, selected, newNames, onChange, groups = [], recent = 0 }: {
  kind: 'person' | 'topic';
  options: { id: ID; name: string; reading?: string; rank: number }[];
  selected: ID[];
  newNames: string[];
  onChange: (selected: ID[], newNames: string[]) => void;
  /** 人のグループ。ドロップダウン・検索・直近の列に人と混ぜて出す */
  groups?: PickGroup[];
  /** 入力欄の下に出す直近の候補の数(0なら出さない) */
  recent?: number;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<ID | null>(null);
  const prefix = kind === 'topic' ? '#' : '';
  const clean = q.trim().replace(/^#/, '');
  const nq = normalize(clean);
  const rankOf = useMemo(() => new Map(options.map((o) => [o.id, o.rank])), [options]);
  // グループの並び順は、メンバーのうち一番最近の人に合わせる(人と混ぜて並べるため)
  const groupRank = (g: PickGroup) => Math.max(0, ...g.memberIds.map((m) => rankOf.get(m) ?? 0));
  // 開いている間は並び順を固定(選んだ瞬間に項目が飛ばないように)
  const [frozen, setFrozen] = useState<Map<ID, number> | null>(null);
  const openList = () => {
    if (!open) setFrozen(new Map([...options.map((o) => [o.id, o.rank] as const), ...groups.map((g) => [g.id, groupRank(g)] as const)]));
    setOpen(true);
  };
  type Row = { type: 'item'; o: (typeof options)[number]; rank: number } | { type: 'group'; g: PickGroup; rank: number };
  const list = useMemo(() => {
    const r = (id: ID, cur: number) => frozen?.get(id) ?? cur;
    const rows: Row[] = [
      ...(nq ? options.filter((o) => nameMatches(o, clean)) : options).map((o) => ({ type: 'item' as const, o, rank: r(o.id, o.rank) })),
      ...groups
        .filter((g) => g.memberIds.length && (!nq || normalize(g.name).includes(nq)))
        .map((g) => ({ type: 'group' as const, g, rank: r(g.id, groupRank(g)) })),
    ];
    return rows.sort((a, b) => b.rank - a.rank);
  }, [options, groups, nq, frozen]);
  // 直近の候補は画面を開いた時点の順で固定(選ぶたびに並びが変わらないように)
  const [recentIds] = useState(() => [...options].sort((a, b) => b.rank - a.rank).slice(0, recent).map((o) => o.id));
  const recentOpts = recentIds.map((id) => options.find((o) => o.id === id)).filter((o): o is (typeof options)[number] => !!o);
  const quickGroups = [...groups].filter((g) => g.memberIds.length).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const exact =
    options.some((o) => normalize(o.name) === nq) || newNames.some((n) => normalize(n) === nq);

  const toggle = (id: ID) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], newNames);
  const allIn = (g: PickGroup) => g.memberIds.every((m) => selected.includes(m));
  /** グループを選ぶ: 全員入っていれば全員外し、そうでなければ全員入れる */
  const toggleGroup = (g: PickGroup) =>
    onChange(allIn(g) ? selected.filter((x) => !g.memberIds.includes(x)) : [...new Set([...selected, ...g.memberIds])], newNames);
  const addNew = () => {
    if (!clean) return;
    const found = options.find((o) => normalize(o.name) === nq);
    if (found) {
      if (!selected.includes(found.id)) onChange([...selected, found.id], newNames);
    } else if (!newNames.some((n) => normalize(n) === nq)) {
      onChange(selected, [...newNames, clean]);
    }
    setQ('');
  };
  // ドロップダウン内のタップで入力欄のフォーカスが外れないように
  const keep = (e: React.MouseEvent | React.TouchEvent) => e.preventDefault();
  const shownGroup = openGroup ? groups.find((g) => g.id === openGroup) : undefined;

  return (
    <div className="picker">
      {(selected.length > 0 || newNames.length > 0) && (
        <div className="chips">
          {selected.map((id) => {
            const o = options.find((x) => x.id === id);
            return (
              <button key={id} type="button" className={`chip ${kind} on`} onClick={() => toggle(id)}>
                {prefix}{o?.name ?? '?'} <span className="x">×</span>
              </button>
            );
          })}
          {newNames.map((n) => (
            <button key={'new:' + n} type="button" className={`chip ${kind} on`} onClick={() => onChange(selected, newNames.filter((x) => x !== n))}>
              {prefix}{n} <span className="new">{t('新規')}</span> <span className="x">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="combo">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); openList(); }}
          onFocus={openList}
          onClick={openList}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={kind === 'person' ? t('🔍 名前で検索して選ぶ／新規入力') : t('🔍 話題で検索して選ぶ／新規入力')}
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              addNew();
            }
          }}
        />
        <span className="combo-caret" aria-hidden>▾</span>
        {open && (
          <ul className="dropdown" onMouseDown={keep}>
            {!clean && list.length > 0 && <li className="dd-head">{t('最後に選んだ順')}</li>}
            {clean && !exact && (
              <li className="dd-item add" onClick={addNew}>
                {t('＋「{name}」を新しく追加', { name: prefix + clean })}
              </li>
            )}
            {list.map((row) => {
              if (row.type === 'group') {
                const g = row.g;
                const on = allIn(g);
                return (
                  <li key={'g:' + g.id} className={`dd-item dd-group ${on ? 'on' : ''}`} onClick={() => { toggleGroup(g); setQ(''); }}>
                    <span className="check">{on ? '✓' : ''}</span>
                    <span className="group-mark">{t('グループ')}</span>
                    {g.name}
                    <span className="reading">{t('{n}人', { n: g.memberIds.length })}</span>
                  </li>
                );
              }
              const o = row.o;
              const on = selected.includes(o.id);
              return (
                <li key={o.id} className={`dd-item ${on ? 'on' : ''}`} onClick={() => { toggle(o.id); setQ(''); }}>
                  <span className="check">{on ? '✓' : ''}</span>
                  {prefix}{o.name}
                  {o.reading && <span className="reading">{o.reading}</span>}
                </li>
              );
            })}
            {list.length === 0 && !clean && (
              <li className="dd-empty">{t('まだありません。名前を入力すると追加できます')}</li>
            )}
          </ul>
        )}
      </div>
      {(recentOpts.some((o) => !selected.includes(o.id)) || (recent > 0 && quickGroups.length > 0)) && (
        <div className="chips quick">
          {/* 選んだものは上の選択済みに移る */}
          {recentOpts.filter((o) => !selected.includes(o.id)).map((o) => (
            <button key={o.id} type="button" className={`chip ${kind}`} onClick={() => toggle(o.id)}>
              ＋ {prefix}{o.name}
            </button>
          ))}
          {recent > 0 && quickGroups.map((g) => (
            <button key={'g:' + g.id} type="button" className={`chip group ${openGroup === g.id ? 'on' : ''}`} onClick={() => setOpenGroup(openGroup === g.id ? null : g.id)}>
              {g.name} {openGroup === g.id ? '▴' : '▾'}
            </button>
          ))}
        </div>
      )}
      {shownGroup && (
        <div className="chips group-members">
          {shownGroup.memberIds
            .map((id) => options.find((o) => o.id === id))
            .filter((o): o is (typeof options)[number] => !!o)
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
            .map((o) => {
              const on = selected.includes(o.id);
              return (
                <button key={o.id} type="button" className={`chip person ${on ? 'on' : ''}`} onClick={() => toggle(o.id)}>
                  {on ? '✓ ' : ''}{o.name}
                </button>
              );
            })}
          <button type="button" className="link small-link" onClick={() => toggleGroup(shownGroup)}>
            {allIn(shownGroup) ? t('全員外す') : t('全員選ぶ')}
          </button>
        </div>
      )}
    </div>
  );
}
