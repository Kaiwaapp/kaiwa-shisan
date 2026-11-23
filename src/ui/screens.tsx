import { useMemo, useState } from 'react';
import type { ID } from '../core/types';
import {
  ENTRY_SORTS, NAME_SORTS, normalize, searchEntries, sortEntriesBy, sortNames, statsBy,
  type EntrySort, type NameSort,
} from '../core/search';
import { back, formatDate, go, useData, usePref, useStore } from './hooks';
import { EntryList, Header, SearchBox, SortSelect } from './components';

const ALL = '';
const UNFILED = '__unfiled__';

// ---- 記録タブ(フォルダ・並べ替え・検索) ----
export function EntriesScreen() {
  const data = useData();
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<EntrySort>('entrySort', 'newest');
  const [folder, setFolder] = usePref<string>('folder', ALL);
  const folders = useMemo(() => [...data.folders].sort((a, b) => a.name.localeCompare(b.name, 'ja')), [data.folders]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.entries) m.set(e.folderId ?? UNFILED, (m.get(e.folderId ?? UNFILED) ?? 0) + 1);
    return m;
  }, [data.entries]);
  // 消されたフォルダを選んだままなら「すべて」に戻す
  const current = folder === ALL || folder === UNFILED || data.folders.some((f) => f.id === folder) ? folder : ALL;
  const list = useMemo(() => {
    const inFolder =
      current === ALL ? data.entries : data.entries.filter((e) => (e.folderId ?? UNFILED) === current);
    return sortEntriesBy(searchEntries({ ...data, entries: inFolder }, q), sort);
  }, [data, q, sort, current]);
  const folderName = data.folders.find((f) => f.id === current)?.name;

  return (
    <div className="screen">
      <Header title={folderName ?? (current === UNFILED ? '未分類' : '記録')} />
      <div className="chips folders">
        <button className={`chip folder ${current === ALL ? 'on' : ''}`} onClick={() => setFolder(ALL)}>
          すべて <span className="n">{data.entries.length}</span>
        </button>
        {folders.map((f) => (
          <button key={f.id} className={`chip folder ${current === f.id ? 'on' : ''}`} onClick={() => setFolder(f.id)}>
            ▤ {f.name} <span className="n">{counts.get(f.id) ?? 0}</span>
          </button>
        ))}
        {folders.length > 0 && (
          <button className={`chip folder ${current === UNFILED ? 'on' : ''}`} onClick={() => setFolder(UNFILED)}>
            未分類 <span className="n">{counts.get(UNFILED) ?? 0}</span>
          </button>
        )}
        <button className="chip folder ghost" onClick={() => go('/folders')}>
          {folders.length ? 'フォルダを管理' : '＋ フォルダを作る'}
        </button>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="本文・人・話題で検索" />
      <div className="toolbar">
        <span className="count">{list.length}件</span>
        <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
      </div>
      <EntryList
        entries={list}
        data={data}
        empty={
          q ? '見つかりませんでした'
            : current !== ALL ? 'このフォルダにはまだ記録がありません'
            : <>まだ記録がありません。<br />右下の＋から、話したことを書いてみましょう。</>
        }
      />
    </div>
  );
}

/** 新規記録を、いま開いているフォルダに入れるため */
export const currentFolderForNew = (): string | undefined => {
  try {
    const v = localStorage.getItem('kaiwa-shisan:pref:folder');
    return v && v !== UNFILED ? v : undefined;
  } catch {
    return undefined;
  }
};

// ---- フォルダの管理 ----
export function FoldersScreen() {
  const data = useData();
  const store = useStore();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<ID | null>(null);
  const [editName, setEditName] = useState('');
  const counts = new Map<string, number>();
  for (const e of data.entries) if (e.folderId) counts.set(e.folderId, (counts.get(e.folderId) ?? 0) + 1);
  const folders = [...data.folders].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const add = async () => {
    if (!name.trim()) return;
    await store.addFolder(name);
    setName('');
  };
  return (
    <div className="screen">
      <Header title="フォルダ" left={<button className="link" onClick={() => back('/')}>‹ 記録</button>} />
      <div className="form">
        <div className="picker-input">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新しいフォルダの名前"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }}
          />
          <button className="btn small primary" disabled={!name.trim()} onClick={add}>作成</button>
        </div>
        {folders.length === 0 ? (
          <div className="empty">まだフォルダがありません。<br />「仕事」「家族」など、記録を分けて管理できます。</div>
        ) : (
          <ul className="rows">
            {folders.map((f) =>
              editing === f.id ? (
                <li key={f.id} className="row-edit">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <div className="row-actions">
                    <button className="btn small primary" disabled={!editName.trim()} onClick={async () => { await store.renameFolder(f.id, editName); setEditing(null); }}>保存</button>
                    <button className="btn small danger" onClick={async () => {
                      if (!confirm(`フォルダ「${f.name}」を削除しますか？\n中の記録は消えず、未分類に移ります。`)) return;
                      await store.deleteFolder(f.id);
                      setEditing(null);
                    }}>削除</button>
                    <button className="btn small" onClick={() => setEditing(null)}>やめる</button>
                  </div>
                </li>
              ) : (
                <li key={f.id} className="row-item" onClick={() => { setEditing(f.id); setEditName(f.name); }}>
                  <span className="name">▤ {f.name}</span>
                  <span className="sub">{counts.get(f.id) ?? 0}件</span>
                  <span className="chev">✎</span>
                </li>
              ),
            )}
          </ul>
        )}
        <p className="muted small">記録をフォルダに入れるには、記録の編集画面で「フォルダ」を選びます。</p>
      </div>
    </div>
  );
}

// ---- 人・話題の一覧 ----
function NameList({ kind }: { kind: 'person' | 'topic' }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<NameSort>(kind + 'Sort', 'last');
  const stats = useMemo(() => statsBy(data, kind), [data, kind]);
  const items = sortNames(
    (kind === 'person' ? data.people : data.topics)
      .filter((x) => !q || normalize(x.name).includes(normalize(q.replace(/^#/, ''))))
      .map((x) => ({ ...x, stat: stats.get(x.id) ?? { count: 0, first: '', last: '' } })),
    sort,
  );
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
        <>
          <div className="toolbar">
            <span className="count">{items.length}{kind === 'person' ? '人' : '件'}</span>
            <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
          </div>
          <ul className="rows">
            {items.map((x) => (
              <li key={x.id} className="row-item" onClick={() => go(base + x.id)}>
                <span className={kind === 'topic' ? 'name topic-name' : 'name'}>
                  {kind === 'topic' ? '#' : ''}{x.name}
                </span>
                <span className="sub">
                  {x.stat.count}件
                  {x.stat.count > 0 && (sort === 'first' ? ` ・ 最初 ${formatDate(x.stat.first)}` : ` ・ 最終 ${formatDate(x.stat.last)}`)}
                </span>
                <span className="chev">›</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export const PeopleScreen = () => <NameList kind="person" />;
export const TopicsScreen = () => <NameList kind="topic" />;

/** 別の人・話題に統合するUI */
function MergeBox({ kind, id, name }: { kind: 'person' | 'topic'; id: ID; name: string }) {
  const data = useData();
  const store = useStore();
  const [target, setTarget] = useState('');
  const list = (kind === 'person' ? data.people : data.topics)
    .filter((x) => x.id !== id)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const p = kind === 'topic' ? '#' : '';
  if (list.length === 0) return null;
  const targetName = list.find((x) => x.id === target)?.name;
  const run = async () => {
    if (!target || !targetName) return;
    const msg = `「${p}${name}」を「${p}${targetName}」に統合します。\n${p}${name}の記録はすべて${p}${targetName}のものになり、「${p}${name}」は消えます。よろしいですか？`;
    if (!confirm(msg)) return;
    if (kind === 'person') await store.mergePeople(id, target);
    else await store.mergeTopics(id, target);
    location.replace(`#/${kind === 'person' ? 'people' : 'topics'}/${target}`);
  };
  return (
    <section className="panel">
      <h2>{kind === 'person' ? '別の人に統合' : '別の話題に統合'}</h2>
      <p className="muted small">
        同じ{kind === 'person' ? '人' : '話題'}を別名で登録してしまったときに、1つにまとめます。
      </p>
      <select className="select block" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">統合先を選ぶ</option>
        {list.map((x) => (
          <option key={x.id} value={x.id}>{p}{x.name}</option>
        ))}
      </select>
      <button className="btn block" disabled={!target} onClick={run}>
        {targetName ? `「${p}${targetName}」に統合する` : '統合する'}
      </button>
    </section>
  );
}

// ---- 人の詳細: この人に話したこと ----
export function PersonScreen({ id }: { id: ID }) {
  const data = useData();
  const store = useStore();
  const person = data.people.find((p) => p.id === id);
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<EntrySort>('detailSort', 'newest');
  const [topicFilter, setTopicFilter] = useState<ID | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');

  const mine = useMemo(() => data.entries.filter((e) => e.personIds.includes(id)), [data, id]);
  const topicCounts = useMemo(() => {
    const m = new Map<ID, number>();
    for (const e of mine) for (const t of e.topics) m.set(t.topicId, (m.get(t.topicId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [mine]);
  const shown = useMemo(() => {
    const base = topicFilter ? mine.filter((e) => e.topics.some((t) => t.topicId === topicFilter)) : mine;
    return sortEntriesBy(searchEntries({ ...data, entries: base }, q), sort);
  }, [mine, topicFilter, q, data, sort]);

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
          <MergeBox kind="person" id={id} name={person.name} />
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
          {mine.length > 1 && (
            <div className="toolbar">
              <span className="count">{shown.length}件</span>
              <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
            </div>
          )}
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
  const [sort, setSort] = usePref<EntrySort>('detailSort', 'newest');
  const [personFilter, setPersonFilter] = useState<ID | null>(null);

  const entries = useMemo(() => data.entries.filter((e) => e.topics.some((t) => t.topicId === id)), [data, id]);
  const people = useMemo(() => {
    const m = new Map<ID, number>();
    for (const e of entries) for (const p of e.personIds) m.set(p, (m.get(p) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const shown = sortEntriesBy(personFilter ? entries.filter((e) => e.personIds.includes(personFilter)) : entries, sort);

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
          <MergeBox kind="topic" id={id} name={topic.name} />
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
          <div className="toolbar">
            <span className="section-title inline">この話題の記録 <span className="muted">{entries.length}件</span></span>
            {entries.length > 1 && <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />}
          </div>
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
