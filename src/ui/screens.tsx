import { useEffect, useMemo, useState } from 'react';
import type { ID } from '../core/types';
import {
  ENTRY_SORTS, NAME_SORTS, lastSeen, normalize, searchEntries, sortEntriesBy, sortNames, statsBy,
  type EntrySort, type NameSort,
} from '../core/search';
import { back, formatDate, go, useData, usePref, useStore } from './hooks';
import { folderDescendants, folderPath } from '../core/store';
import type { Folder } from '../core/types';
import { EntryList, Header, SearchBox, SortSelect } from './components';

// ---- 記録タブ: iPhoneのメモのように、フォルダと記録が並ぶ(フォルダは入れ子可) ----
export function FolderScreen({ folderId }: { folderId: ID | null }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<EntrySort>('entrySort', 'newest');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(false);
  const folder = folderId ? data.folders.find((f) => f.id === folderId) : undefined;

  useEffect(() => { if (folderId) store.markViewed('folder', folderId); }, [store, folderId]);
  // フォルダも同じ並べ替えで並べる(話した日は中の記録から)
  const children = useMemo(() => {
    const kids = data.folders.filter((f) => f.parentId === folderId);
    const span = new Map<ID, { first: string; last: string; edited: number }>();
    for (const k of kids) {
      const scope = new Set([k.id, ...folderDescendants(data.folders, k.id)]);
      const s = { first: '', last: '', edited: k.updatedAt };
      for (const e of data.entries) {
        if (!e.folderId || !scope.has(e.folderId)) continue;
        if (!s.first || e.talkedOn < s.first) s.first = e.talkedOn;
        if (e.talkedOn > s.last) s.last = e.talkedOn;
        s.edited = Math.max(s.edited, e.updatedAt);
      }
      span.set(k.id, s);
    }
    const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, 'ja');
    return kids.sort((a, b) => {
      const sa = span.get(a.id)!, sb = span.get(b.id)!;
      switch (sort) {
        case 'viewed': return lastSeen(b) - lastSeen(a) || byName(a, b);
        case 'updated': return sb.edited - sa.edited || byName(a, b);
        case 'oldest': return (sa.first || '9999').localeCompare(sb.first || '9999') || byName(a, b);
        default: return sb.last.localeCompare(sa.last) || byName(a, b);
      }
    });
  }, [data, folderId, sort]);
  const path = useMemo(() => folderPath(data.folders, folderId), [data.folders, folderId]);
  /** フォルダごとの記録数(中のフォルダの分も含む) */
  const deepCount = useMemo(() => {
    const direct = new Map<string, number>();
    for (const e of data.entries) if (e.folderId) direct.set(e.folderId, (direct.get(e.folderId) ?? 0) + 1);
    return (id: ID) => [id, ...folderDescendants(data.folders, id)].reduce((n, x) => n + (direct.get(x) ?? 0), 0);
  }, [data]);
  const memos = useMemo(
    () => sortEntriesBy(data.entries.filter((e) => e.folderId === folderId), sort),
    [data.entries, folderId, sort],
  );
  // 検索はこのフォルダ以下すべて(一番上なら全体)が対象
  const results = useMemo(() => {
    if (!q.trim()) return null;
    const scope = folderId ? new Set([folderId, ...folderDescendants(data.folders, folderId)]) : null;
    const pool = scope ? data.entries.filter((e) => e.folderId && scope.has(e.folderId)) : data.entries;
    return sortEntriesBy(searchEntries({ ...data, entries: pool }, q), sort);
  }, [q, data, folderId, sort]);

  if (folderId && !folder) return <Missing />;
  const parent = folder?.parentId ? data.folders.find((f) => f.id === folder.parentId) : undefined;
  const upPath = parent ? `/f/${parent.id}` : '/';

  const createFolder = async () => {
    if (!newName.trim()) return;
    await store.addFolder(newName, folderId);
    setNewName('');
    setAdding(false);
  };

  return (
    <div className="screen">
      <Header
        title={folder ? folder.name : '記録'}
        left={folder && <button className="link" onClick={() => location.replace('#' + upPath)}>‹ {parent ? parent.name : '記録'}</button>}
        right={folder && <button className="link" onClick={() => setEditing(!editing)}>{editing ? '閉じる' : '編集'}</button>}
      />
      {path.length >= 2 && (
        <nav className="crumbs">
          <button className="link" onClick={() => location.replace('#/')}>⌂ 記録</button>
          {path.slice(0, -1).map((f) => (
            <span key={f.id}>
              <span className="sep">›</span>
              <button className="link" onClick={() => location.replace(`#/f/${f.id}`)}>{f.name}</button>
            </span>
          ))}
          <span className="sep">›</span>
          <span className="here">{path[path.length - 1].name}</span>
        </nav>
      )}
      {editing && folder ? (
        <FolderEdit id={folder.id} onDone={() => setEditing(false)} />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder={folder ? `「${folder.name}」の中を検索` : '本文・人・話題で検索'} />
          {results ? (
            <>
              <div className="toolbar">
                <span className="count">{results.length}件</span>
                <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
              </div>
              <EntryList entries={results} data={data} empty="見つかりませんでした" />
            </>
          ) : (
            <>
              <div className="toolbar">
                <span className="count">
                  {children.length > 0 && `フォルダ ${children.length} ・ `}記録 {memos.length}件
                </span>
                <span className="toolbar-right">
                  {!adding && <button className="link small-link" onClick={() => setAdding(true)}>＋ フォルダ</button>}
                  <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
                </span>
              </div>
              {(children.length > 0 || adding) && (
                <ul className="rows folder-rows">
                  {children.map((f) => (
                    <li key={f.id} className="row-item" onClick={() => go(`/f/${f.id}`)}>
                      <span className="name"><span className="folder-icon">▤</span>{f.name}</span>
                      <span className="sub">{deepCount(f.id)}</span>
                      <span className="chev">›</span>
                    </li>
                  ))}
                  {adding && (
                    <li className="row-edit">
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="新しいフォルダの名前"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) createFolder(); }}
                      />
                      <div className="row-actions">
                        <button className="btn small primary" disabled={!newName.trim()} onClick={createFolder}>作成</button>
                        <button className="btn small" onClick={() => { setAdding(false); setNewName(''); }}>やめる</button>
                      </div>
                    </li>
                  )}
                </ul>
              )}
              <EntryList
                entries={memos}
                data={data}
                hideFolder
                empty={
                  folder
                    ? <>このフォルダはまだ空です。<br />右下の＋で記録を、「＋ フォルダ」でフォルダを作れます。</>
                    : children.length ? 'フォルダに入っていない記録はありません' : <>まだ記録がありません。<br />右下の＋から、話したことを書いてみましょう。</>
                }
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** フォルダの名前変更・移動・削除 */
function FolderEdit({ id, onDone }: { id: ID; onDone: () => void }) {
  const data = useData();
  const store = useStore();
  const folder = data.folders.find((f) => f.id === id)!;
  const [name, setName] = useState(folder.name);
  const [parent, setParent] = useState(folder.parentId ?? '');
  const blocked = folderDescendants(data.folders, id);
  const choices = folderChoices(data.folders).filter((c) => c.id !== id && !blocked.has(c.id));
  const save = async () => {
    if (name.trim() !== folder.name) await store.renameFolder(id, name);
    if ((parent || null) !== folder.parentId) await store.moveFolder(id, parent || null);
    onDone();
  };
  return (
    <div className="form">
      <section className="field">
        <label>フォルダの名前</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </section>
      <section className="field">
        <label>入れる場所</label>
        <select className="select block" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">一番上</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </section>
      <button className="btn primary block" disabled={!name.trim()} onClick={save}>保存</button>
      <button className="btn danger block" onClick={async () => {
        if (!confirm(`フォルダ「${folder.name}」を削除しますか？\n中の記録とフォルダは消えず、1つ上の階層に移ります。`)) return;
        const up = folder.parentId;
        await store.deleteFolder(id);
        location.replace(up ? `#/f/${up}` : '#/');
      }}>
        このフォルダを削除
      </button>
    </div>
  );
}

/** フォルダ選択肢を「仕事 / 会議」のようなパス付きで、階層順に */
export function folderChoices(folders: { id: ID; name: string; parentId: ID | null }[]) {
  const out: { id: ID; label: string }[] = [];
  const walk = (parentId: ID | null, prefix: string, depth: number) => {
    if (depth > 20) return;
    for (const f of folders.filter((x) => x.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
      const label = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, label });
      walk(f.id, label, depth + 1);
    }
  };
  walk(null, '', 0);
  return out;
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
  useEffect(() => { store.markViewed('person', id); }, [store, id]);
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
  useEffect(() => { store.markViewed('topic', id); }, [store, id]);
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
