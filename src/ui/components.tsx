import { useMemo, useState, type ReactNode } from 'react';
import type { AppData, Entry, ID } from '../core/types';
import { normalize } from '../core/search';
import { formatDate, go } from './hooks';

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

export function EntryCard({ entry, data, hidePersonId, hideTopicId }: {
  entry: Entry;
  data: AppData;
  hidePersonId?: ID;
  hideTopicId?: ID;
}) {
  const people = entry.personIds
    .filter((id) => id !== hidePersonId)
    .map((id) => data.people.find((p) => p.id === id))
    .filter(Boolean);
  const topics = entry.topics
    .filter((t) => t.topicId !== hideTopicId)
    .map((t) => data.topics.find((x) => x.id === t.topicId))
    .filter(Boolean);
  return (
    <article className="card" onClick={() => go(`/edit/${entry.id}`)}>
      <div className="card-text">{entry.text || <span className="muted">（本文なし）</span>}</div>
      <div className="card-meta">
        <span className="date">{formatDate(entry.talkedOn)}</span>
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

export function EntryList({ entries, data, empty, hidePersonId, hideTopicId }: {
  entries: Entry[];
  data: AppData;
  empty: ReactNode;
  hidePersonId?: ID;
  hideTopicId?: ID;
}) {
  if (entries.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="list">
      {entries.map((e) => (
        <EntryCard key={e.id} entry={e} data={data} hidePersonId={hidePersonId} hideTopicId={hideTopicId} />
      ))}
    </div>
  );
}

/** 既存から選ぶ or 新しく追加するチップ選択 */
export function ChipPicker({ kind, options, selected, onToggle, onCreate }: {
  kind: 'person' | 'topic';
  options: { id: ID; name: string; rank: number }[];
  selected: ID[];
  onToggle: (id: ID) => void;
  onCreate: (name: string) => void;
}) {
  const [q, setQ] = useState('');
  const prefix = kind === 'topic' ? '#' : '';
  const nq = normalize(q.trim().replace(/^#/, ''));
  const candidates = useMemo(() => {
    const list = options.filter((o) => !selected.includes(o.id));
    const hit = nq ? list.filter((o) => normalize(o.name).includes(nq)) : list;
    return hit.sort((a, b) => b.rank - a.rank).slice(0, nq ? 20 : 12);
  }, [options, selected, nq]);
  const exact = options.some((o) => normalize(o.name) === nq);
  const submit = () => {
    const name = q.trim().replace(/^#/, '');
    if (!name) return;
    const found = options.find((o) => normalize(o.name) === normalize(name));
    if (found) {
      if (!selected.includes(found.id)) onToggle(found.id);
    } else onCreate(name);
    setQ('');
  };
  return (
    <div className="picker">
      <div className="chips">
        {selected.map((id) => {
          const o = options.find((x) => x.id === id);
          return (
            <button key={id} type="button" className={`chip ${kind} on`} onClick={() => onToggle(id)}>
              {prefix}{o?.name ?? '?'} <span className="x">×</span>
            </button>
          );
        })}
      </div>
      <div className="picker-input">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === 'person' ? '名前を入力して追加' : '話題を入力して追加'}
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {q.trim() && !exact && (
          <button type="button" className="btn small" onClick={submit}>
            追加
          </button>
        )}
      </div>
      {candidates.length > 0 && (
        <div className="chips suggestions">
          {candidates.map((o) => (
            <button key={o.id} type="button" className={`chip ${kind}`} onClick={() => { onToggle(o.id); setQ(''); }}>
              {prefix}{o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
