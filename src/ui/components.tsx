import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Entry, ID } from '../core/types';
import { nameMatches, normalize } from '../core/search';
import { folderPath } from '../core/store';
import { formatDate, go } from './hooks';
import { copyText, SelectMark, useInteract, usePress, type ItemRef } from './interact';

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
        <button className="search-clear" onClick={() => onChange('')} aria-label="クリア">
          ×
        </button>
      )}
    </div>
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
  const item: ItemRef = { kind: 'entry', id: entry.id, label: entry.text.split('\n')[0].slice(0, 24) || '（本文なし）', scope: 'entry' };
  const { lifted, handlers } = usePress(item, () => go(`/edit/${entry.id}`));
  const { sel } = useInteract();
  return (
    <article className={`card ${lifted ? 'lifted' : ''} ${sel.active ? 'selecting' : ''}`} {...handlers}>
      <SelectMark item={item} />
      <div className="card-text">
        {entry.pinned && <span className="pin" aria-label="ピン留め">📌</span>}
        {entry.text || <span className="muted">（本文なし）</span>}
      </div>
      {!sel.active && (
        <button
          className="copy-btn"
          aria-label="本文をコピー"
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
        <div className="section-title">📌 ピン留め</div>
        <EntryList entries={pinned} empty="" {...props} />
        {rest.length > 0 && <div className="section-title">記録</div>}
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
      <button className="link" onClick={onVisible}>さらに表示（残り{rest}件）</button>
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
      <select value={value} onChange={(e) => onChange(e.target.value as K)} aria-label="並べ替え">
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * 人・話題の選択。入力欄をタップすると既存の候補がドロップダウンで出る。
 * 候補にない名前は「新しく追加」で仮登録し、記録の保存時に作られる。
 */
export function ComboPicker({ kind, options, selected, newNames, onChange }: {
  kind: 'person' | 'topic';
  options: { id: ID; name: string; reading?: string; rank: number }[];
  selected: ID[];
  newNames: string[];
  onChange: (selected: ID[], newNames: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const prefix = kind === 'topic' ? '#' : '';
  const clean = q.trim().replace(/^#/, '');
  const nq = normalize(clean);
  // 開いている間は並び順を固定(選んだ瞬間に項目が飛ばないように)
  const [frozen, setFrozen] = useState<Map<ID, number> | null>(null);
  const openList = () => {
    if (!open) setFrozen(new Map(options.map((o) => [o.id, o.rank])));
    setOpen(true);
  };
  const list = useMemo(() => {
    const hit = nq ? options.filter((o) => nameMatches(o, clean)) : options;
    const r = (o: { id: ID; rank: number }) => frozen?.get(o.id) ?? o.rank;
    return [...hit].sort((a, b) => r(b) - r(a));
  }, [options, nq, frozen]);
  const exact =
    options.some((o) => normalize(o.name) === nq) || newNames.some((n) => normalize(n) === nq);

  const toggle = (id: ID) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], newNames);
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
              {prefix}{n} <span className="new">新規</span> <span className="x">×</span>
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
          placeholder={kind === 'person' ? '🔍 名前で検索して選ぶ／新規入力' : '🔍 話題で検索して選ぶ／新規入力'}
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
            {!clean && list.length > 0 && <li className="dd-head">最後に選んだ順</li>}
            {clean && !exact && (
              <li className="dd-item add" onClick={addNew}>
                ＋「{prefix}{clean}」を新しく追加
              </li>
            )}
            {list.map((o) => {
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
              <li className="dd-empty">まだありません。名前を入力すると追加できます</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
