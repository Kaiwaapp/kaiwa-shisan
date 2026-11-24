import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { entryLabel, type ID } from '../core/types';
import {
  ENTRY_SORTS, NAME_SORTS, lastSeen, nameMatches, normalize, searchEntries, sortEntriesBy, sortNames, statsBy,
  type EntrySort, type NameSort,
} from '../core/search';
import { back, formatDate, go, useData, usePref, useStore } from './hooks';
import { folderDescendants, folderPath, foldersOf } from '../core/store';
import { Crumbs, FolderEdit, FolderRows, FolderSelect, UpButton, makeDeepCount, rootHref } from './folders';
import { SelectButton, SelectionBar, toast, useInteract, usePress, SelectMark, type ItemRef } from './interact';
import type { Folder } from '../core/types';
import { EntryList, Header, LoadMore, SearchBox, SortSelect, useIncremental } from './components';
import { currentLang, t } from '../i18n';
export { folderChoices } from './folders';

// ---- 記録タブ: iPhoneのメモのように、フォルダと記録が並ぶ(フォルダは入れ子可) ----
export function FolderScreen({ folderId }: { folderId: ID | null }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<EntrySort>('entrySort', 'newest');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const folders = useMemo(() => foldersOf(data.folders, 'entry'), [data.folders]);
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  const selecting = useInteract().sel.active;
  const trash = useTrash();

  useEffect(() => { if (folderId) store.markViewed('folder', folderId); }, [store, folderId]);
  // フォルダも同じ並べ替えで並べる(話した日は中の記録から)
  const children = useMemo(() => {
    const kids = folders.filter((f) => f.parentId === folderId);
    const span = new Map<ID, { first: string; last: string; edited: number }>();
    for (const k of kids) {
      const scope = new Set([k.id, ...folderDescendants(folders, k.id)]);
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
  }, [data.entries, folders, folderId, sort]);
  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId]);
  const deepCount = useMemo(() => makeDeepCount(folders, data.entries), [folders, data.entries]);
  const memos = useMemo(
    () => sortEntriesBy(data.entries.filter((e) => e.folderId === folderId), sort),
    [data.entries, folderId, sort],
  );
  // 検索はこのフォルダ以下すべて(一番上なら全体)が対象
  const results = useMemo(() => {
    if (!q.trim()) return null;
    const scope = folderId ? new Set([folderId, ...folderDescendants(folders, folderId)]) : null;
    const pool = scope ? data.entries.filter((e) => e.folderId && scope.has(e.folderId)) : data.entries;
    return sortEntriesBy(searchEntries({ ...data, entries: pool }, q), sort);
  }, [q, data, folders, folderId, sort]);

  if (folderId && !folder) return <Missing />;
  const parent = folder?.parentId ? folders.find((f) => f.id === folder.parentId) : undefined;

  return (
    <div className="screen">
      <Header
        title={folder ? folder.name : t('記録')}
        left={folder && <UpButton scope="entry" parent={parent} />}
        right={<span className="header-actions">{!editing && <SelectButton />}{folder && !selecting && <button className="link" onClick={() => setEditing(!editing)}>{editing ? t('閉じる') : t('編集')}</button>}</span>}
      />
      <Crumbs scope="entry" path={path} />
      {editing && folder ? (
        <FolderEdit id={folder.id} onDone={() => setEditing(false)} />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder={folder ? t('「{name}」の中を検索', { name: folder.name }) : t('本文・人・話題で検索')} />
          {results ? (
            <>
              <div className="toolbar">
                <span className="count">{t('{n}件', { n: results.length })}</span>
                <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
              </div>
              <EntryList entries={results} data={data} empty={t('見つかりませんでした')} />
            </>
          ) : (
            <>
              <div className="toolbar">
                <span className="count">
                  {children.length > 0 && t('{n}フォルダ・', { n: children.length })}{t('{n}件', { n: memos.length })}
                </span>
                <span className="toolbar-right">
                  {!adding && !selecting && <button className="link small-link" onClick={() => setAdding(true)}>{t('＋ フォルダ')}</button>}
                  <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
                </span>
              </div>
              <FolderRows scope="entry" folderId={folderId} children={children} count={deepCount} total={data.entries.length} adding={adding} setAdding={setAdding} />
              {!folderId && trash.length > 0 && !selecting && (
                <ul className="rows folder-rows">
                  <li className="row-item" onClick={() => go('/trash')}>
                    <span className="name"><span className="folder-icon">🗑</span>{t('最近削除した項目')}</span>
                    <span className="sub">{trash.length}</span>
                    <span className="chev">›</span>
                  </li>
                </ul>
              )}
              <EntryList
                entries={memos}
                data={data}
                pinSplit
                hideFolder
                empty={
                  folder
                    ? <>{t('このフォルダはまだ空です。')}<br />{t('右下の＋で記録を、「＋ フォルダ」でフォルダを作れます。')}</>
                    : children.length ? t('フォルダに入っていない記録はありません') : <>{t('まだ記録がありません。')}<br />{t('右下の＋から、話したことを書いてみましょう。')}</>
                }
              />
              <SelectionBar folderId={folderId} all={[
                ...children.map((f) => ({ kind: 'folder' as const, id: f.id, label: f.name, scope: 'entry' as const })),
                ...memos.map((e) => ({ kind: 'entry' as const, id: e.id, label: entryLabel(e, 24), scope: 'entry' as const })),
              ]} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---- 最近削除した項目 ----
export function useTrash() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.trash);
}

export function TrashScreen() {
  const store = useStore();
  const trash = useTrash();
  const [picked, setPicked] = useState<Set<ID>>(new Set());
  const daysLeft = (t: number) => Math.max(0, 30 - Math.floor((Date.now() - t) / 86400000));
  const toggle = (id: ID) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const targets = picked.size ? [...picked] : trash.map((e) => e.id);
  return (
    <div className="screen">
      <Header title={t('最近削除した項目')} left={<button className="link" onClick={() => location.replace('#/')}>{t('‹ 記録')}</button>} />
      <p className="muted small pad">{t('削除した記録は30日間ここに残り、その後完全に消えます。タップで選んで、復元か完全に削除ができます。')}</p>
      {trash.length === 0 ? (
        <div className="empty">{t('最近削除した項目はありません')}</div>
      ) : (
        <>
          <div className="list">
            {trash.map((e) => (
              <article key={e.id} className={`card selecting ${picked.has(e.id) ? 'picked' : ''}`} onClick={() => toggle(e.id)}>
                <span className={`select-mark ${picked.has(e.id) ? 'on' : ''}`}>{picked.has(e.id) ? '✓' : ''}</span>
                {e.title && <div className="card-title">{e.title}</div>}
                {(e.text || !e.title) && <div className={`card-text ${e.title ? 'sub' : ''}`}>{e.text || t('（本文なし）')}</div>}
                <div className="card-meta"><span className="date">{t('あと{n}日', { n: daysLeft(e.deletedAt!) })}</span></div>
              </article>
            ))}
          </div>
          <div className="select-bar">
            <button className="link" onClick={async () => {
              await store.restoreEntries(targets);
              toast(t('{n}件を復元しました', { n: targets.length }));
              setPicked(new Set());
            }}>{picked.size ? t('{n}件を復元', { n: picked.size }) : t('すべて復元')}</button>
            <button className="link danger" onClick={async () => {
              if (!confirm(t('{n}件を完全に削除します。元に戻せません。よろしいですか？', { n: targets.length }))) return;
              await store.purgeEntries(targets);
              setPicked(new Set());
            }}>{picked.size ? t('{n}件を完全に削除', { n: picked.size }) : t('すべて完全に削除')}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- すべての記録: フォルダに関係なく全部 ----
export function AllEntriesScreen() {
  const data = useData();
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<EntrySort>('entrySort', 'newest');
  const list = useMemo(() => sortEntriesBy(searchEntries(data, q), sort), [data, q, sort]);
  return (
    <div className="screen">
      <Header title={t('すべての記録')} left={<button className="link" onClick={() => location.replace('#/')}>{t('‹ 記録')}</button>} />
      <SearchBox value={q} onChange={setQ} placeholder={t('本文・人・話題で検索（読み仮名も可）')} />
      <div className="toolbar">
        <span className="count">{t('{n}件', { n: list.length })}</span>
        <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
      </div>
      <EntryList entries={list} data={data} pinSplit empty={q ? t('見つかりませんでした') : t('まだ記録がありません')} />
    </div>
  );
}

// ---- 人・話題の一覧(フォルダで整理できる) ----
type NameKind = 'person' | 'topic';

function useNameItems(kind: NameKind, sort: NameSort) {
  const data = useData();
  const stats = useMemo(() => statsBy(data, kind), [data, kind]);
  return useMemo(
    () => sortNames(
      (kind === 'person' ? data.people : data.topics).map((x) => ({ ...x, stat: stats.get(x.id) ?? { count: 0, first: '', last: '' } })),
      sort,
    ),
    [data, kind, stats, sort],
  );
}

function NameRows({ kind, items, sort, showFolder }: {
  kind: NameKind;
  items: ReturnType<typeof useNameItems>;
  sort: NameSort;
  showFolder?: boolean;
}) {
  const [limit, more] = useIncremental(items.length);
  if (items.length === 0) return null;
  return (
    <>
      <ul className="rows">
        {items.slice(0, limit).map((x) => <NameRow key={x.id} kind={kind} x={x} sort={sort} showFolder={showFolder} />)}
      </ul>
      {limit < items.length && <LoadMore onVisible={more} rest={items.length - limit} />}
    </>
  );
}

function NameRow({ kind, x, sort, showFolder }: {
  kind: NameKind;
  x: ReturnType<typeof useNameItems>[number];
  sort: NameSort;
  showFolder?: boolean;
}) {
  const data = useData();
  const base = kind === 'person' ? '/people/' : '/topics/';
  const item: ItemRef = { kind, id: x.id, label: (kind === 'topic' ? '#' : '') + x.name, scope: kind };
  const { lifted, handlers } = usePress(item, () => go(base + x.id));
  return (
    <li className={`row-item pressable ${lifted ? 'lifted' : ''}`} {...handlers}>
      <span className={kind === 'topic' ? 'name topic-name' : 'name'}>
        <SelectMark item={item} />
        {x.pinned && <span className="pin">📌</span>}
        {kind === 'topic' ? '#' : ''}{x.name}
        {x.reading && <span className="reading">{x.reading}</span>}
        {showFolder && x.folderId && (
          <span className="reading">▤ {folderPath(data.folders, x.folderId).map((f) => f.name).join(' / ')}</span>
        )}
      </span>
      <span className="sub">
        {t('{n}件', { n: x.stat.count })}
        {x.stat.count > 0 && (sort === 'first' ? t(' ・ 最初 {d}', { d: formatDate(x.stat.first) }) : t(' ・ 最終 {d}', { d: formatDate(x.stat.last) }))}
      </span>
      <span className="chev">›</span>
    </li>
  );
}

/** ピン留めを上に分けて並べる */
function PinnedSplit({ kind, items, sort, showFolder, restTitle }: {
  kind: NameKind;
  items: ReturnType<typeof useNameItems>;
  sort: NameSort;
  showFolder?: boolean;
  restTitle: string;
}) {
  const pinned = items.filter((x) => x.pinned);
  if (!pinned.length) return <NameRows kind={kind} items={items} sort={sort} showFolder={showFolder} />;
  const rest = items.filter((x) => !x.pinned);
  return (
    <>
      <div className="section-title">{t('📌 ピン留め')}</div>
      <NameRows kind={kind} items={pinned} sort={sort} showFolder={showFolder} />
      {rest.length > 0 && <div className="section-title">{restTitle}</div>}
      <NameRows kind={kind} items={rest} sort={sort} showFolder={showFolder} />
    </>
  );
}

export function NameFolderScreen({ kind, folderId }: { kind: NameKind; folderId: ID | null }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<NameSort>(kind + 'Sort', 'last');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const all = useNameItems(kind, sort);
  const selecting = useInteract().sel.active;
  const folders = useMemo(() => foldersOf(data.folders, kind), [data.folders, kind]);
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  useEffect(() => { if (folderId) store.markViewed('folder', folderId); }, [store, folderId]);
  const label = kind === 'person' ? t('人') : t('話題');
  const unit = kind === 'person' ? '{n}人' : '{n}件';

  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId]);
  const deepCount = useMemo(() => makeDeepCount(folders, kind === 'person' ? data.people : data.topics), [folders, data, kind]);
  const children = useMemo(() => {
    const kids = folders.filter((f) => f.parentId === folderId);
    const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, 'ja');
    if (sort === 'viewed') return kids.sort((a, b) => lastSeen(b) - lastSeen(a) || byName(a, b));
    if (sort === 'count') return kids.sort((a, b) => deepCount(b.id) - deepCount(a.id) || byName(a, b));
    if (sort === 'name') return kids.sort(byName);
    // 最後に/最初に話した順: 中の人・話題の日付から
    const span = (id: ID, pick: 'first' | 'last') => {
      const scope = new Set([id, ...folderDescendants(folders, id)]);
      const ds = all.filter((x) => x.folderId && scope.has(x.folderId)).map((x) => x.stat[pick]).filter(Boolean).sort();
      return pick === 'first' ? ds[0] ?? '9999' : ds[ds.length - 1] ?? '';
    };
    return sort === 'first'
      ? kids.sort((a, b) => span(a.id, 'first').localeCompare(span(b.id, 'first')) || byName(a, b))
      : kids.sort((a, b) => span(b.id, 'last').localeCompare(span(a.id, 'last')) || byName(a, b));
  }, [folders, folderId, sort, deepCount, all]);
  const here = all.filter((x) => (x.folderId ?? null) === folderId);
  const results = useMemo(() => {
    if (!q.trim()) return null;
    const scope = folderId ? new Set([folderId, ...folderDescendants(folders, folderId)]) : null;
    return all.filter((x) => nameMatches(x, q) && (!scope || (x.folderId && scope.has(x.folderId))));
  }, [q, all, folders, folderId]);

  if (folderId && !folder) return <Missing />;
  const parent = folder?.parentId ? folders.find((f) => f.id === folder.parentId) : undefined;
  const clean = q.trim().replace(/^#/, '');
  const exact = clean && all.some((x) => normalize(x.name) === normalize(clean));
  const add = async () => {
    if (!clean) return;
    const x = kind === 'person' ? await store.addPerson(clean, folderId) : await store.addTopic(clean, folderId);
    setQ('');
    go((kind === 'person' ? '/people/' : '/topics/') + x.id);
  };

  return (
    <div className="screen">
      <Header
        title={folder ? folder.name : label}
        left={folder && <UpButton scope={kind} parent={parent} />}
        right={<span className="header-actions">{!editing && <SelectButton />}{folder && !selecting && <button className="link" onClick={() => setEditing(!editing)}>{editing ? t('閉じる') : t('編集')}</button>}</span>}
      />
      <Crumbs scope={kind} path={path} />
      {editing && folder ? (
        <FolderEdit id={folder.id} onDone={() => setEditing(false)} />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder={folder ? t('「{name}」の中を探す・追加する', { name: folder.name }) : t(kind === 'person' ? '人を探す・追加する' : '話題を探す・追加する')} />
          {clean && !exact && (
            <button className="btn block ghost" onClick={add}>
              {folder ? t('「{name}」を「{folder}」に追加', { name: clean, folder: folder.name }) : t(kind === 'person' ? '「{name}」を人に追加' : '「{name}」を話題に追加', { name: clean })}
            </button>
          )}
          {results ? (
            <>
              <div className="toolbar">
                <span className="count">{t(unit, { n: results.length })}</span>
                <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
              </div>
              <NameRows kind={kind} items={results} sort={sort} showFolder />
              {results.length === 0 && <div className="empty">{t('見つかりませんでした')}</div>}
            </>
          ) : (
            <>
              <div className="toolbar">
                <span className="count">
                  {children.length > 0 && t('{n}フォルダ・', { n: children.length })}{t(unit, { n: here.length })}
                </span>
                <span className="toolbar-right">
                  {!adding && !selecting && <button className="link small-link" onClick={() => setAdding(true)}>{t('＋ フォルダ')}</button>}
                  <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
                </span>
              </div>
              <FolderRows scope={kind} folderId={folderId} children={children} count={deepCount} total={all.length} adding={adding} setAdding={setAdding} />
              <PinnedSplit kind={kind} items={here} sort={sort} restTitle={label} />
              <SelectionBar all={[
                ...children.map((f) => ({ kind: 'folder' as const, id: f.id, label: f.name, scope: kind })),
                ...here.map((x) => ({ kind, id: x.id, label: x.name, scope: kind })),
              ]} />
              {here.length === 0 && (
                <div className="empty">
                  {folder
                    ? <>{t('このフォルダはまだ空です。')}<br />{t(kind === 'person' ? '人の「編集」でフォルダを選ぶか、上の検索欄から追加できます。' : '話題の「編集」でフォルダを選ぶか、上の検索欄から追加できます。')}</>
                    : all.length === 0
                      ? (kind === 'person'
                        ? <>{t('まだ誰もいません。')}<br />{t('記録を書くときに話した相手を追加できます。')}</>
                        : <>{t('まだ話題がありません。')}<br />{t('記録を書くときに話題タグを付けられます。')}</>)
                      : t(kind === 'person' ? 'フォルダに入っていない人はいません' : 'フォルダに入っていない話題はありません')}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function NameAllScreen({ kind }: { kind: NameKind }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<NameSort>(kind + 'Sort', 'last');
  const all = useNameItems(kind, sort);
  const list = all.filter((x) => nameMatches(x, q));
  const label = kind === 'person' ? t('人') : t('話題');
  return (
    <div className="screen">
      <Header title={t(kind === 'person' ? 'すべての人' : 'すべての話題')} left={<button className="link" onClick={() => location.replace('#' + rootHref(kind))}>‹ {label}</button>} />
      <SearchBox value={q} onChange={setQ} placeholder={t(kind === 'person' ? '人を探す' : '話題を探す')} />
      <div className="toolbar">
        <span className="count">{t(kind === 'person' ? '{n}人' : '{n}件', { n: list.length })}</span>
        <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
      </div>
      <PinnedSplit kind={kind} items={list} sort={sort} showFolder restTitle={label} />
      {list.length === 0 && <div className="empty">{q ? t('見つかりませんでした') : t('まだありません')}</div>}
    </div>
  );
}

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
    const msg = t('「{a}」を「{b}」に統合します。\n{a}の記録はすべて{b}のものになり、「{a}」は消えます。よろしいですか？', { a: p + name, b: p + targetName });
    if (!confirm(msg)) return;
    if (kind === 'person') await store.mergePeople(id, target);
    else await store.mergeTopics(id, target);
    location.replace(`#/${kind === 'person' ? 'people' : 'topics'}/${target}`);
  };
  return (
    <section className="panel">
      <h2>{kind === 'person' ? t('別の人に統合') : t('別の話題に統合')}</h2>
      <p className="muted small">
        {t(kind === 'person' ? '同じ人を別名で登録してしまったときに、1つにまとめます。' : '同じ話題を別名で登録してしまったときに、1つにまとめます。')}
      </p>
      <select className="select block" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">{t('統合先を選ぶ')}</option>
        {list.map((x) => (
          <option key={x.id} value={x.id}>{p}{x.name}</option>
        ))}
      </select>
      <button className="btn block" disabled={!target} onClick={run}>
        {targetName ? t('「{name}」に統合する', { name: p + targetName }) : t('統合する')}
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
  const [reading, setReading] = useState('');
  const [memo, setMemo] = useState('');
  const [pfolder, setPfolder] = useState<ID | null>(null);

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
        left={<button className="link" onClick={() => back('/people')}>{t('‹ 人')}</button>}
        right={<button className="link" onClick={() => { setName(person.name); setReading(person.reading ?? ''); setMemo(person.memo); setPfolder(person.folderId ?? null); setEditing(!editing); }}>{editing ? t('閉じる') : t('編集')}</button>}
      />
      {editing ? (
        <div className="form">
          <section className="field">
            <label>{t('名前')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          {currentLang() === 'ja' && (
            <section className="field">
              <label>{t('読み仮名（検索用）')}</label>
              <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder={t('例：たなか')} />
            </section>
          )}
          <section className="field">
            <label>{t('フォルダ')}</label>
            <FolderSelect scope="person" value={pfolder} onChange={setPfolder} />
          </section>
          <section className="field">
            <label>{t('メモ（関係・好きなものなど）')}</label>
            <textarea className="textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </section>
          <button className="btn primary block" disabled={!name.trim()} onClick={async () => { await store.updatePerson(id, { name: name.trim(), reading: reading.trim(), memo, folderId: pfolder }); setEditing(false); }}>
            {t('保存')}
          </button>
          <MergeBox kind="person" id={id} name={person.name} />
          <button className="btn danger block" onClick={async () => {
            if (!confirm(t('「{name}」を削除しますか？\n記録は残り、この人の紐づけだけ外れます。', { name: person.name }))) return;
            await store.deletePerson(id);
            back('/people');
          }}>
            {t('この人を削除')}
          </button>
        </div>
      ) : (
        <>
          {person.memo && <p className="memo">{person.memo}</p>}
          <div className="section-title">
            {t('{name}に話したこと', { name: person.name })} <span className="muted">{t('{n}件', { n: mine.length })}</span>
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
          {mine.length > 3 && <SearchBox value={q} onChange={setQ} placeholder={t('{name}に話したことを検索', { name: person.name })} />}
          {mine.length > 1 && (
            <div className="toolbar">
              <span className="count">{t('{n}件', { n: shown.length })}</span>
              <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
            </div>
          )}
          <EntryList entries={shown} data={data} hidePersonId={id} empty={mine.length ? t('該当なし') : t('まだ記録がありません')} />
          <button className="btn block ghost" onClick={() => go(`/new?person=${id}`)}>
            {t('＋ {name}に話したことを記録', { name: person.name })}
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
  const [reading, setReading] = useState('');
  const [tfolder, setTfolder] = useState<ID | null>(null);
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
        left={<button className="link" onClick={() => back('/topics')}>{t('‹ 話題')}</button>}
        right={<button className="link" onClick={() => { setName(topic.name); setReading(topic.reading ?? ''); setTfolder(topic.folderId ?? null); setEditing(!editing); }}>{editing ? t('閉じる') : t('編集')}</button>}
      />
      {editing ? (
        <div className="form">
          <section className="field">
            <label>{t('話題の名前')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          {currentLang() === 'ja' && (
            <section className="field">
              <label>{t('読み仮名（検索用）')}</label>
              <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder={t('例：りょこう')} />
            </section>
          )}
          <section className="field">
            <label>{t('フォルダ')}</label>
            <FolderSelect scope="topic" value={tfolder} onChange={setTfolder} />
          </section>
          <button className="btn primary block" disabled={!name.trim()} onClick={async () => { await store.updateTopic(id, { name: name.trim(), reading: reading.trim(), folderId: tfolder }); setEditing(false); }}>
            {t('保存')}
          </button>
          <MergeBox kind="topic" id={id} name={topic.name} />
          <button className="btn danger block" onClick={async () => {
            if (!confirm(t('「{name}」を削除しますか？\n記録は残り、このタグだけ外れます。', { name: '#' + topic.name }))) return;
            await store.deleteTopic(id);
            back('/topics');
          }}>
            {t('この話題を削除')}
          </button>
        </div>
      ) : (
        <>
          <div className="section-title">{t('話した相手')} <span className="muted">{t('{n}人', { n: people.length })}</span></div>
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
            <p className="muted pad">{t('まだ誰にも話していません')}</p>
          )}
          <div className="toolbar">
            <span className="section-title inline">{t('この話題の記録')} <span className="muted">{t('{n}件', { n: entries.length })}</span></span>
            {entries.length > 1 && <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />}
          </div>
          <EntryList entries={shown} data={data} hideTopicId={id} empty={t('まだ記録がありません')} />
          <button className="btn block ghost" onClick={() => go(`/new?topic=${id}`)}>
            {t('＋ {name}の記録を追加', { name: '#' + topic.name })}
          </button>
        </>
      )}
    </div>
  );
}

function Missing() {
  return (
    <div className="screen">
      <Header title="" left={<button className="link" onClick={() => back()}>{t('‹ 戻る')}</button>} />
      <div className="empty">{t('見つかりませんでした（削除された可能性があります）')}</div>
    </div>
  );
}
