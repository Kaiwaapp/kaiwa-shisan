import { useMemo, useState } from 'react';
import type { AppData, ID } from '../core/types';
import { normalize, searchEntries, sortEntries } from '../core/search';
import { back, formatDate, go, useData, useStore } from './hooks';
import { EntryList, Header, SearchBox } from './components';

// ---- 記録タブ(全件 + 検索) ----
export function EntriesScreen() {
  const data = useData();
  const [q, setQ] = useState('');
  const list = useMemo(() => searchEntries(data, q), [data, q]);
  return (
    <div className="screen">
      <Header title="記録" />
      <SearchBox value={q} onChange={setQ} placeholder="本文・人・話題で検索" />
      {q && <div className="count">{list.length}件</div>}
      <EntryList
        entries={list}
        data={data}
        empty={q ? '見つかりませんでした' : <>まだ記録がありません。<br />右下の＋から、話したことを書いてみましょう。</>}
      />
    </div>
  );
}

interface Stat { count: number; last: string }

const statsBy = (data: AppData, key: 'person' | 'topic') => {
  const m = new Map<ID, Stat>();
  for (const e of data.entries) {
    const ids = key === 'person' ? e.personIds : e.topics.map((t) => t.topicId);
    for (const id of ids) {
      const s = m.get(id) ?? { count: 0, last: '' };
      s.count++;
      if (e.talkedOn > s.last) s.last = e.talkedOn;
      m.set(id, s);
    }
  }
  return m;
};

function NameList({ kind }: { kind: 'person' | 'topic' }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  const stats = useMemo(() => statsBy(data, kind), [data, kind]);
  const items = (kind === 'person' ? data.people : data.topics)
    .filter((x) => !q || normalize(x.name).includes(normalize(q.replace(/^#/, ''))))
    .map((x) => ({ ...x, stat: stats.get(x.id) ?? { count: 0, last: '' } }))
    .sort((a, b) => b.stat.last.localeCompare(a.stat.last) || b.stat.count - a.stat.count || a.name.localeCompare(b.name, 'ja'));
  const label = kind === 'person' ? '人' : '話題';
  const base = kind === 'person' ? '/people/' : '/topics/';
  const add = async () => {
    const name = q.trim().replace(/^#/, '');
    if (!name) return;
    const x = kind === 'person' ? await store.addPerson(name) : await store.addTopic(name);
    setQ('');
    go(base + x.id);
  };
  const exact = q.trim() && items.some((x) => normalize(x.name) === normalize(q.trim().replace(/^#/, '')));
  return (
    <div className="screen">
      <Header title={label} />
      <SearchBox value={q} onChange={setQ} placeholder={`${label}を探す・追加する`} />
      {q.trim() && !exact && (
        <button className="btn block ghost" onClick={add}>
          「{q.trim().replace(/^#/, '')}」を{label}に追加
        </button>
      )}
      {items.length === 0 && !q ? (
        <div className="empty">
          {kind === 'person'
            ? <>まだ誰もいません。<br />記録を書くときに話した相手を追加できます。</>
            : <>まだ話題がありません。<br />記録を書くときに話題タグを付けられます。</>}
        </div>
      ) : (
        <ul className="rows">
          {items.map((x) => (
            <li key={x.id} className="row-item" onClick={() => go(base + x.id)}>
              <span className={kind === 'topic' ? 'name topic-name' : 'name'}>
                {kind === 'topic' ? '#' : ''}{x.name}
              </span>
              <span className="sub">
                {x.stat.count}件{x.stat.last && ` ・ 最終 ${formatDate(x.stat.last)}`}
              </span>
              <span className="chev">›</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const PeopleScreen = () => <NameList kind="person" />;
export const TopicsScreen = () => <NameList kind="topic" />;

// ---- 人の詳細: この人に話したこと ----
export function PersonScreen({ id }: { id: ID }) {
  const data = useData();
  const store = useStore();
  const person = data.people.find((p) => p.id === id);
  const [q, setQ] = useState('');
  const [topicFilter, setTopicFilter] = useState<ID | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');

  const mine = useMemo(() => sortEntries(data.entries.filter((e) => e.personIds.includes(id))), [data, id]);
  const topicCounts = useMemo(() => {
    const m = new Map<ID, number>();
    for (const e of mine) for (const t of e.topics) m.set(t.topicId, (m.get(t.topicId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [mine]);
  const shown = useMemo(() => {
    const base = topicFilter ? mine.filter((e) => e.topics.some((t) => t.topicId === topicFilter)) : mine;
    return q ? searchEntries({ ...data, entries: base }, q) : base;
  }, [mine, topicFilter, q, data]);

  if (!person) return <Missing />;

  return (
    <div className="screen">
      <Header
        title={person.name}
        left={<button className="link" onClick={() => back('/people')}>‹ 人</button>}
        right={<button className="link" onClick={() => { setName(person.name); setMemo(person.memo); setEditing(!editing); }}>{editing ? '閉じる' : '編集'}</button>}
      />
      {editing ? (
        <div className="form">
          <section className="field">
            <label>名前</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          <section className="field">
            <label>メモ（関係・好きなものなど）</label>
            <textarea className="textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </section>
          <button className="btn primary block" disabled={!name.trim()} onClick={async () => { await store.updatePerson(id, { name: name.trim(), memo }); setEditing(false); }}>
            保存
          </button>
          <button className="btn danger block" onClick={async () => {
            if (!confirm(`「${person.name}」を削除しますか？\n記録は残り、この人の紐づけだけ外れます。`)) return;
            await store.deletePerson(id);
            back('/people');
          }}>
            この人を削除
          </button>
        </div>
      ) : (
        <>
          {person.memo && <p className="memo">{person.memo}</p>}
          <div className="section-title">
            {person.name}に話したこと <span className="muted">{mine.length}件</span>
          </div>
          {topicCounts.length > 0 && (
            <div className="chips filter">
              {topicCounts.map(([tid, n]) => {
                const t = data.topics.find((x) => x.id === tid);
                if (!t) return null;
                return (
                  <button key={tid} className={`chip topic ${topicFilter === tid ? 'on' : ''}`} onClick={() => setTopicFilter(topicFilter === tid ? null : tid)}>
                    #{t.name} <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>
          )}
          {mine.length > 3 && <SearchBox value={q} onChange={setQ} placeholder={`${person.name}に話したことを検索`} />}
          <EntryList entries={shown} data={data} hidePersonId={id} empty={mine.length ? '該当なし' : 'まだ記録がありません'} />
          <button className="btn block ghost" onClick={() => go(`/new?person=${id}`)}>
            ＋ {person.name}に話したことを記録
          </button>
        </>
      )}
    </div>
  );
}

// ---- 話題の詳細: この話題の会話と、話した相手 ----
export function TopicScreen({ id }: { id: ID }) {
  const data = useData();
  const store = useStore();
  const topic = data.topics.find((t) => t.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [personFilter, setPersonFilter] = useState<ID | null>(null);

  const entries = useMemo(() => sortEntries(data.entries.filter((e) => e.topics.some((t) => t.topicId === id))), [data, id]);
  const people = useMemo(() => {
    const m = new Map<ID, number>();
    for (const e of entries) for (const p of e.personIds) m.set(p, (m.get(p) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const shown = personFilter ? entries.filter((e) => e.personIds.includes(personFilter)) : entries;

  if (!topic) return <Missing />;
  return (
    <div className="screen">
      <Header
        title={`#${topic.name}`}
        left={<button className="link" onClick={() => back('/topics')}>‹ 話題</button>}
        right={<button className="link" onClick={() => { setName(topic.name); setEditing(!editing); }}>{editing ? '閉じる' : '編集'}</button>}
      />
      {editing ? (
        <div className="form">
          <section className="field">
            <label>話題の名前</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          <button className="btn primary block" disabled={!name.trim()} onClick={async () => { await store.renameTopic(id, name); setEditing(false); }}>
            保存
          </button>
          <button className="btn danger block" onClick={async () => {
            if (!confirm(`「#${topic.name}」を削除しますか？\n記録は残り、このタグだけ外れます。`)) return;
            await store.deleteTopic(id);
            back('/topics');
          }}>
            この話題を削除
          </button>
        </div>
      ) : (
        <>
          <div className="section-title">話した相手 <span className="muted">{people.length}人</span></div>
          {people.length > 0 ? (
            <div className="chips filter">
              {people.map(([pid, n]) => {
                const p = data.people.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <button key={pid} className={`chip person ${personFilter === pid ? 'on' : ''}`} onClick={() => setPersonFilter(personFilter === pid ? null : pid)}>
                    {p.name} <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted pad">まだ誰にも話していません</p>
          )}
          <div className="section-title">この話題の記録 <span className="muted">{entries.length}件</span></div>
          <EntryList entries={shown} data={data} hideTopicId={id} empty="まだ記録がありません" />
          <button className="btn block ghost" onClick={() => go(`/new?topic=${id}`)}>
            ＋ #{topic.name}の記録を追加
          </button>
        </>
      )}
    </div>
  );
}

function Missing() {
  return (
    <div className="screen">
      <Header title="" left={<button className="link" onClick={() => back()}>‹ 戻る</button>} />
      <div className="empty">見つかりませんでした（削除された可能性があります）</div>
    </div>
  );
}
