import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { autoFocusRef } from './focus';
import { PersonProfileSection } from './profile';
import { entryHasPerson, entryLabel, type ID } from '../core/types';
import {
  ENTRY_SORTS, NAME_SORTS, byManual, lastSeen, nameMatches, normalize, searchEntries, sortEntriesBy, sortNames, statsBy,
  type EntrySort, type NameSort,
} from '../core/search';
import { back, formatDate, go, useData, usePref, useStore } from './hooks';
import { folderDescendants, folderPath, foldersOf } from '../core/store';
import { Crumbs, FoldHeader, FolderEdit, FolderRows, FolderSelect, TitleIcons, useFold, UpButton, makeDeepCount, rootHref } from './folders';
import { PressHint, reorderProps, SelectButton, SelectionBar, toast, useInteract, usePress, useReorderList, SelectMark, type ItemRef } from './interact';
import type { Folder } from '../core/types';
import { EntryList, EntryPreview, FavToggle, Header, LoadMore, SearchBox, SortSelect, useIncremental } from './components';
import { currentLang, t } from '../i18n';
export { folderChoices } from './folders';
import { PresetHint } from './PresetTopics';
import { SampleHint } from './samples';
import { useFeatures } from './features';
import { confirmLeave, useDiscardGuard } from './discard';
import { Fab, createItems, useAddRequest } from './fab';
import { Icon } from './icons';
import { GroupBar, GroupToggles, groupHref, groupsOf } from './groups';
import { RelationBadge, RelationBar, RelationPicker } from './RelationParts';
import { relationName, useRelations } from './relations';
import { PersonSchedule, PersonTodos } from './schedule';

// ---- 話題タブ: iPhoneのメモのように、フォルダと話題が並ぶ(フォルダは入れ子可) ----
export function FolderScreen({ folderId }: { folderId: ID | null }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  // 入力中は前の結果を出したまま裏で検索し、打鍵を待たせない
  const dq = useDeferredValue(q);
  const [sort, setSort] = usePref<EntrySort>('entrySort', 'newest');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const folders = useMemo(() => foldersOf(data.folders, 'entry'), [data.folders]);
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  const selecting = useInteract().sel.active;
  const trash = useTrash();
  const feat = useFeatures();
  // フォルダ機能オフ: 一番上でフォルダを出さず、全部の話題を並べる
  const flat = !feat.folders && !folderId;
  useAddRequest('folder', () => setAdding(true), !flat);
  const [memosOpen, setMemosOpen] = useFold('entries');

  useEffect(() => { if (folderId) store.markViewed('folder', folderId); }, [store, folderId]);
  // フォルダも同じ並べ替えで並べる(話した日は中の話題から)
  const children = useMemo(() => {
    if (flat) return [];
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
        case 'manual': return byManual(a, b);
        case 'viewed': return lastSeen(b) - lastSeen(a) || byName(a, b);
        case 'updated': return sb.edited - sa.edited || byName(a, b);
        case 'oldest': return (sa.first || '9999').localeCompare(sb.first || '9999') || byName(a, b);
        default: return sb.last.localeCompare(sa.last) || byName(a, b);
      }
    });
  }, [data.entries, folders, folderId, sort, flat]);
  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId]);
  const deepCount = useMemo(() => makeDeepCount(folders, data.entries), [folders, data.entries]);
  const memos = useMemo(
    () => sortEntriesBy(flat ? data.entries : data.entries.filter((e) => e.folderId === folderId), sort),
    [data.entries, folderId, sort, flat],
  );
  // 検索はこのフォルダ以下すべて(一番上なら全体)が対象
  const results = useMemo(() => {
    if (!dq.trim()) return null;
    const scope = folderId ? new Set([folderId, ...folderDescendants(folders, folderId)]) : null;
    const pool = scope ? data.entries.filter((e) => e.folderId && scope.has(e.folderId)) : data.entries;
    return sortEntriesBy(searchEntries({ ...data, entries: pool }, dq), sort);
  }, [dq, data, folders, folderId, sort]);

  if (folderId && !folder) return <Missing />;
  const parent = folder?.parentId ? folders.find((f) => f.id === folder.parentId) : undefined;

  return (
    <div className="screen">
      <Header
        title={folder ? folder.name : t('話題')}
        lead={<TitleIcons scope="entry" />}
        left={folder && <UpButton scope="entry" parent={parent} />}
        right={<span className="header-actions">{!editing && !adding && !selecting && !flat && <FolderAddButton onClick={() => setAdding(true)} />}{!editing && <SelectButton />}{folder && !selecting && <button className="link" onClick={() => (editing ? confirmLeave(() => setEditing(false)) : setEditing(true))}>{editing ? t('閉じる') : t('編集')}</button>}</span>}
      />
      <Crumbs scope="entry" path={path} />
      {editing && folder ? (
        <FolderEdit id={folder.id} onDone={() => setEditing(false)} />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder={folder ? t('「{name}」の中を検索', { name: folder.name }) : t('本文・人・タグで検索')} />
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
              {!folderId && !selecting && <SampleHint />}
              <div className="toolbar">
                <span className="count">
                  {children.length > 0 && t('{n}フォルダ・', { n: children.length })}{t('{n}件', { n: memos.length })}
                </span>
                <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
              </div>
              <FolderRows
                scope="entry" folderId={folderId} children={children} count={deepCount} adding={adding} setAdding={setAdding} reorder={sort === 'manual'}
                extra={!folderId && trash.length > 0 && !selecting && (
                  <ul className="rows folder-rows">
                    <li className="row-item" onClick={() => go('/trash')}>
                      <span className="name"><span className="folder-icon">🗑</span>{t('最近削除した項目')}</span>
                      <span className="sub">{trash.length}</span>
                      <span className="chev">›</span>
                    </li>
                  </ul>
                )}
              />
              {memos.length > 0 && (
                <FoldHeader label={t('話題')} count={memos.length} open={memosOpen} onToggle={() => setMemosOpen(!memosOpen)} />
              )}
              {(memosOpen || memos.length === 0) && <EntryList
                entries={memos}
                data={data}
                pinSplit
                hideFolder
                reorder={sort === 'manual'}
                empty={
                  folder
                    ? <>{t('このフォルダはまだ空です。')}<br />{t('右下の＋で話題を、右上のフォルダのアイコンでフォルダを作れます。')}</>
                    : children.length ? t('フォルダに入っていない話題はありません') : <>{t('まだ話題がありません。')}<br />{t('右下の＋から、話したことを書いてみましょう。')}</>
                }
             />}
              {/* 長押しの案内は一覧の一番下(一覧を見る邪魔をしない) */}
              {!folderId && <PressHint />}
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
      <Header title={t('最近削除した項目')} left={<button className="link" onClick={() => back('/')}>{t('‹ 戻る')}</button>} />
      <p className="muted small pad">{t('削除した話題は30日間ここに残り、その後完全に消えます。タップで選んで、復元か完全に削除ができます。')}</p>
      {trash.length === 0 ? (
        <div className="empty">{t('最近削除した項目はありません')}</div>
      ) : (
        <>
          <div className="list">
            {trash.map((e) => (
              <article key={e.id} className={`card selecting ${picked.has(e.id) ? 'picked' : ''}`} onClick={() => toggle(e.id)}>
                <span className={`select-mark ${picked.has(e.id) ? 'on' : ''}`}>{picked.has(e.id) ? '✓' : ''}</span>
                <EntryPreview entry={e} />
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

// ---- すべての話題: フォルダに関係なく全部(fav ならお気に入りだけ) ----
export function AllEntriesScreen({ fav }: { fav?: boolean }) {
  const data = useData();
  const [q, setQ] = useState('');
  // 入力中は前の結果を出したまま裏で検索し、打鍵を待たせない
  const dq = useDeferredValue(q);
  const [sort, setSort] = usePref<EntrySort>('entrySort', 'newest');
  const list = useMemo(() => {
    const pool = fav ? { ...data, entries: data.entries.filter((e) => e.favorite) } : data;
    return sortEntriesBy(searchEntries(pool, dq), sort);
  }, [data, dq, sort, fav]);
  return (
    <div className="screen">
      <Header title={fav ? t('★ お気に入りの話題') : t('すべての話題')} left={<button className="link" onClick={() => back('/')}>{t('‹ 戻る')}</button>} />
      <SearchBox value={q} onChange={setQ} placeholder={fav ? t('お気に入りの話題を検索') : t('本文・人・タグで検索（読み仮名も可）')} />
      <div className="toolbar">
        <span className="count">{t('{n}件', { n: list.length })}</span>
        <SortSelect value={sort} options={ENTRY_SORTS} onChange={setSort} />
      </div>
      <EntryList
        entries={list}
        data={data}
        pinSplit={!fav}
        reorder={sort === 'manual' && !q.trim()}
        empty={q ? t('見つかりませんでした') : fav ? <>{t('お気に入りの話題はまだありません。')}<br />{t('話題の☆をタップすると、ここに入ります。')}</> : t('まだ話題がありません')}
      />
    </div>
  );
}

/** 人・タグの画面の話題は、手動の並び順では並べない(並べ替えはフォルダの中で) */
const DETAIL_SORTS = ENTRY_SORTS.filter((o) => o.key !== 'manual');

// ---- 人・タグの一覧(フォルダで整理できる) ----
type NameKind = 'person' | 'topic';

export function useNameItems(kind: NameKind, sort: NameSort) {
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

export function NameRows({ kind, items, sort, showFolder, reorder }: {
  kind: NameKind;
  items: ReturnType<typeof useNameItems>;
  sort: NameSort;
  showFolder?: boolean;
  /** 手動の並び順で、長押しして上下に動かすと並べ替えられる(検索結果では使わない) */
  reorder?: boolean;
}) {
  const [limit, more] = useIncremental(items.length);
  const list = useReorderList(reorder && sort === 'manual' ? items.map((x) => x.id) : null);
  if (items.length === 0) return null;
  return (
    <>
      <ul className="rows">
        {items.slice(0, limit).map((x) => <NameRow key={x.id} kind={kind} x={x} sort={sort} showFolder={showFolder} list={list} />)}
      </ul>
      {limit < items.length && <LoadMore onVisible={more} rest={items.length - limit} />}
    </>
  );
}

function NameRow({ kind, x, sort, showFolder, list }: {
  kind: NameKind;
  list?: string;
  x: ReturnType<typeof useNameItems>[number];
  sort: NameSort;
  showFolder?: boolean;
}) {
  const data = useData();
  const base = kind === 'person' ? '/people/' : '/topics/';
  const item: ItemRef = { kind, id: x.id, label: (kind === 'topic' ? '#' : '') + x.name, scope: kind };
  const { lifted, handlers } = usePress(item, () => go(base + x.id));
  const selecting = useInteract().sel.active;
  const feat = useFeatures();
  const relations = useRelations();
  return (
    <li className={`row-item pressable with-fav ${lifted ? 'lifted' : ''}`} {...reorderProps(list, kind, x.id)} {...handlers}>
      <span className={kind === 'topic' ? 'name topic-name' : 'name'}>
        <SelectMark item={item} />
        {x.pinned && <span className="pin">📌</span>}
        {kind === 'topic' ? '#' : ''}{x.name}
        {x.reading && <span className="reading">{x.reading}</span>}
        {showFolder && feat.folders && x.folderId && (
          <span className="reading">▤ {folderPath(data.folders, x.folderId).map((f) => f.name).join(' / ')}</span>
        )}
        {feat.relations && kind === 'person' && relationName((x as { relation?: string }).relation, relations) && (
          <span className="reading">{relationName((x as { relation?: string }).relation, relations)}</span>
        )}
        {feat.groups && kind === 'person' && (x as { groupIds?: ID[] }).groupIds?.length ? (
          <span className="reading">{groupsOf(data.groups, x as { groupIds?: ID[] }).map((g) => g.name).join('・')}</span>
        ) : null}
      </span>
      <span className="sub">
        {t('{n}件', { n: x.stat.count })}
        {x.stat.count > 0 && (sort === 'first' ? t(' ・ 最初 {d}', { d: formatDate(x.stat.first) }) : t(' ・ 最終 {d}', { d: formatDate(x.stat.last) }))}
      </span>
      {/* ☆は右端の›の手前に置き、件数・日付の長さで位置がずれないようにする */}
      {selecting ? <span className="fav-slot" /> : <FavToggle kind={kind} id={x.id} on={!!x.favorite} />}
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
  if (!pinned.length) return <NameRows kind={kind} items={items} sort={sort} showFolder={showFolder} reorder />;
  const rest = items.filter((x) => !x.pinned);
  return (
    <>
      <div className="section-title">{t('📌 ピン留め')}</div>
      <NameRows kind={kind} items={pinned} sort={sort} showFolder={showFolder} reorder />
      {rest.length > 0 && <div className="section-title">{restTitle}</div>}
      <NameRows kind={kind} items={rest} sort={sort} showFolder={showFolder} reorder />
    </>
  );
}

export function NameFolderScreen({ kind, folderId, rel }: { kind: NameKind; folderId: ID | null; rel?: string | null }) {
  const data = useData();
  const store = useStore();
  const [q, setQ] = useState('');
  // 関係での絞り込み(人タブの一番上だけ)。絞り込み中はフォルダに関係なく全員から出す
  const [relFilter, setRelFilter] = useState<string | null>(rel ?? null);
  const [sort, setSort] = usePref<NameSort>(kind + 'Sort', 'last');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const all = useNameItems(kind, sort);
  const selecting = useInteract().sel.active;
  const folders = useMemo(() => foldersOf(data.folders, kind), [data.folders, kind]);
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  useEffect(() => { if (folderId) store.markViewed('folder', folderId); }, [store, folderId]);
  const label = kind === 'person' ? t('人') : t('タグ');
  const unit = kind === 'person' ? '{n}人' : '{n}件';
  const feat = useFeatures();
  const flat = !feat.folders && !folderId;
  useAddRequest('folder', () => setAdding(true), !flat);

  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId]);
  const deepCount = useMemo(() => makeDeepCount(folders, kind === 'person' ? data.people : data.topics), [folders, data, kind]);
  const children = useMemo(() => {
    if (flat) return [];
    const kids = folders.filter((f) => f.parentId === folderId);
    const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name, 'ja');
    if (sort === 'manual') return kids.sort(byManual);
    if (sort === 'viewed') return kids.sort((a, b) => lastSeen(b) - lastSeen(a) || byName(a, b));
    if (sort === 'count') return kids.sort((a, b) => deepCount(b.id) - deepCount(a.id) || byName(a, b));
    if (sort === 'name') return kids.sort(byName);
    // 最後に/最初に話した順: 中の人・タグの日付から
    const span = (id: ID, pick: 'first' | 'last') => {
      const scope = new Set([id, ...folderDescendants(folders, id)]);
      const ds = all.filter((x) => x.folderId && scope.has(x.folderId)).map((x) => x.stat[pick]).filter(Boolean).sort();
      return pick === 'first' ? ds[0] ?? '9999' : ds[ds.length - 1] ?? '';
    };
    return sort === 'first'
      ? kids.sort((a, b) => span(a.id, 'first').localeCompare(span(b.id, 'first')) || byName(a, b))
      : kids.sort((a, b) => span(b.id, 'last').localeCompare(span(a.id, 'last')) || byName(a, b));
  }, [folders, folderId, sort, deepCount, all, flat]);
  const relOn = kind === 'person' && !folderId && feat.relations;
  const relPicked = relOn && relFilter ? all.filter((x) => (x as { relation?: string }).relation === relFilter) : null;
  const here = flat ? all : all.filter((x) => (x.folderId ?? null) === folderId);
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
        lead={<TitleIcons scope={kind} />}
        left={folder && <UpButton scope={kind} parent={parent} />}
        right={<span className="header-actions">{!editing && !adding && !selecting && !flat && <FolderAddButton onClick={() => setAdding(true)} />}{!editing && <SelectButton />}{folder && !selecting && <button className="link" onClick={() => (editing ? confirmLeave(() => setEditing(false)) : setEditing(true))}>{editing ? t('閉じる') : t('編集')}</button>}</span>}
      />
      <Crumbs scope={kind} path={path} />
      {editing && folder ? (
        <FolderEdit id={folder.id} onDone={() => setEditing(false)} />
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder={folder ? t('「{name}」の中を探す・追加する', { name: folder.name }) : t(kind === 'person' ? '人を探す・追加する' : 'タグを探す・追加する')} />
          {clean && !exact && (
            <button className="btn block ghost" onClick={add}>
              {folder ? t('「{name}」を「{folder}」に追加', { name: clean, folder: folder.name }) : t(kind === 'person' ? '「{name}」を人に追加' : '「{name}」をタグに追加', { name: clean })}
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
              {relOn && <RelationBar value={relFilter} onChange={setRelFilter} />}
              {kind === 'person' && !folderId && feat.groups && !relPicked && <GroupBar />}
              {kind === 'topic' && !folderId && <PresetHint />}
              {relPicked ? (
                <>
                  <div className="toolbar">
                    <span className="count">{t(unit, { n: relPicked.length })}</span>
                    <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
                  </div>
                  <NameRows kind={kind} items={relPicked} sort={sort} showFolder />
                  {relPicked.length === 0 && <div className="empty">{t('見つかりませんでした')}</div>}
                </>
              ) : (<>
              <div className="toolbar">
                <span className="count">
                  {children.length > 0 && t('{n}フォルダ・', { n: children.length })}{t(unit, { n: here.length })}
                </span>
                <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
              </div>
              <FolderRows scope={kind} folderId={folderId} children={children} count={deepCount} adding={adding} setAdding={setAdding} reorder={sort === 'manual'} />
              <PinnedSplit kind={kind} items={here} sort={sort} restTitle={label} />
              <SelectionBar all={[
                ...children.map((f) => ({ kind: 'folder' as const, id: f.id, label: f.name, scope: kind })),
                ...here.map((x) => ({ kind, id: x.id, label: x.name, scope: kind })),
              ]} />
              {here.length === 0 && (
                <div className="empty">
                  {folder
                    ? <>{t('このフォルダはまだ空です。')}<br />{t(kind === 'person' ? '人の「編集」でフォルダを選ぶか、上の検索欄から追加できます。' : 'タグの「編集」でフォルダを選ぶか、上の検索欄から追加できます。')}</>
                    : all.length === 0
                      ? (kind === 'person'
                        ? <>{t('まだ誰もいません。')}<br />{t('話題を書くときに話した相手を追加できます。')}</>
                        : <>{t('まだタグがありません。')}<br />{t('話題を書くときにタグを付けられます。')}</>)
                      : t(kind === 'person' ? 'フォルダに入っていない人はいません' : 'フォルダに入っていないタグはありません')}
                </div>
              )}
              {!folderId && <PressHint />}
              </>)}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function NameAllScreen({ kind, fav }: { kind: NameKind; fav?: boolean }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = usePref<NameSort>(kind + 'Sort', 'last');
  const all = useNameItems(kind, sort);
  const list = all.filter((x) => (!fav || x.favorite) && nameMatches(x, q));
  const label = kind === 'person' ? t('人') : t('タグ');
  const title = fav ? t(kind === 'person' ? '★ お気に入りの人' : '★ お気に入りのタグ') : t(kind === 'person' ? 'すべての人' : 'すべてのタグ');
  const empty = q
    ? t('見つかりませんでした')
    : fav
      ? <>{t(kind === 'person' ? 'お気に入りの人はまだいません。' : 'お気に入りのタグはまだありません。')}<br />{t('一覧の☆をタップすると、ここに入ります。')}</>
      : t('まだありません');
  return (
    <div className="screen">
      <Header title={title} left={<button className="link" onClick={() => back(rootHref(kind))}>{t('‹ 戻る')}</button>} />
      <SearchBox value={q} onChange={setQ} placeholder={t(kind === 'person' ? '人を探す' : 'タグを探す')} />
      <div className="toolbar">
        <span className="count">{t(kind === 'person' ? '{n}人' : '{n}件', { n: list.length })}</span>
        <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
      </div>
      {fav
        ? <NameRows kind={kind} items={list} sort={sort} showFolder reorder />
        : <PinnedSplit kind={kind} items={list} sort={sort} showFolder restTitle={label} />}
      {list.length === 0 && <div className="empty">{empty}</div>}
    </div>
  );
}

/** 別の人・タグに統合するUI */
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
    const msg = t('「{a}」を「{b}」に統合します。\n{a}の話題はすべて{b}のものになり、「{a}」は消えます。よろしいですか？', { a: p + name, b: p + targetName });
    if (!confirm(msg)) return;
    if (kind === 'person') await store.mergePeople(id, target);
    else await store.mergeTopics(id, target);
    location.replace(`#/${kind === 'person' ? 'people' : 'topics'}/${target}`);
  };
  return (
    <section className="panel">
      <h2>{kind === 'person' ? t('別の人に統合') : t('別のタグに統合')}</h2>
      <p className="muted small">
        {t(kind === 'person' ? '同じ人を別名で登録してしまったときに、1つにまとめます。' : '同じタグを別名で登録してしまったときに、1つにまとめます。')}
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
  const feat = useFeatures();
  const person = data.people.find((p) => p.id === id);
  useEffect(() => { store.markViewed('person', id); }, [store, id]);
  const [q, setQ] = useState('');
  // 入力中は前の結果を出したまま裏で検索し、打鍵を待たせない
  const dq = useDeferredValue(q);
  const [sort, setSort] = usePref<EntrySort>('detailSort', 'newest');
  const [topicFilter, setTopicFilter] = useState<ID | null>(null);
  const [entriesOpen, setEntriesOpen] = useFold('person-entries');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [reading, setReading] = useState('');
  const [pfolder, setPfolder] = useState<ID | null>(null);
  const [pgroups, setPgroups] = useState<ID[]>([]);
  const [prel, setPrel] = useState<string | undefined>(undefined);
  const pdirty = editing && !!person && (name !== person.name || reading !== (person.reading ?? '') || pfolder !== (person.folderId ?? null)
    || pgroups.join() !== (person.groupIds ?? []).join() || (feat.relations && prel !== person.relation));
  const savePerson = async () => {
    if (!name.trim()) return false;
    await store.updatePerson(id, { name: name.trim(), reading: reading.trim(), folderId: pfolder, groupIds: pgroups.filter((g) => data.groups.some((x) => x.id === g)), ...(feat.relations ? { relation: prel } : {}) });
    setEditing(false);
  };
  const pguard = useDiscardGuard(!!pdirty, name.trim() ? savePerson : undefined);

  // グループに話した話題も、そのグループの人の話題として出す
  const mine = useMemo(() => (person ? data.entries.filter((e) => entryHasPerson(e, person)) : []), [data, person]);
  const topicCounts = useMemo(() => {
    const m = new Map<ID, number>();
    for (const e of mine) for (const t of e.topics) m.set(t.topicId, (m.get(t.topicId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [mine]);
  const shown = useMemo(() => {
    const base = topicFilter && topicCounts.some(([id]) => id === topicFilter) ? mine.filter((e) => e.topics.some((t) => t.topicId === topicFilter)) : mine;
    return sortEntriesBy(searchEntries({ ...data, entries: base }, dq), sort);
  }, [mine, topicFilter, topicCounts, dq, data, sort]);

  if (!person) return <Missing />;

  return (
    <div className="screen">
      <Header
        title={person.name}
        left={<button className="link" onClick={() => confirmLeave(() => back('/people'))}>{t('‹ 人')}</button>}
        right={<span className="header-actions"><FavToggle kind="person" id={id} on={!!person.favorite} className="in-header" /><button className="link" aria-expanded={editing} onClick={() => { if (editing) { pguard.guard(() => setEditing(false)); return; } setName(person.name); setReading(person.reading ?? ''); setPfolder(person.folderId ?? null); setPgroups(person.groupIds ?? []); setPrel(person.relation); setEditing(true); }}>{editing ? t('閉じる') : t('編集')}</button></span>}
      />
      {pguard.sheet}
      {editing && (
        <section className="form detail-edit">
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
          {feat.relations && <section className="field">
            <label>{t('関係')}</label>
            <RelationPicker value={prel} onChange={setPrel} />
            <button className="link small-link muted" onClick={() => go('/settings/relations')}>{t('選択肢を変える ›')}</button>
          </section>}
          {feat.folders && <section className="field">
            <label>{t('フォルダ')}</label>
            <FolderSelect scope="person" value={pfolder} onChange={setPfolder} />
          </section>}
          {feat.groups && <section className="field">
            <label>{t('グループ（いくつでも）')}</label>
            <GroupToggles value={pgroups} onChange={setPgroups} />
          </section>}
          <button className="btn primary block" disabled={!name.trim()} onClick={savePerson}>
            {t('保存')}
          </button>
          <MergeBox kind="person" id={id} name={person.name} />
          <button className="btn danger block" onClick={async () => {
            if (!confirm(t('「{name}」を削除しますか？\n話題は残り、この人の紐づけだけ外れます。', { name: person.name }))) return;
            await store.deletePerson(id);
            back('/people');
          }}>
            {t('この人を削除')}
          </button>
        </section>
      )}
      {((feat.groups && (person.groupIds?.length ?? 0) > 0) || (feat.relations && person.relation)) && (
        <div className="chips person-groups">
          {feat.relations && <RelationBadge id={person.relation} />}
          {feat.groups && groupsOf(data.groups, person).map((g) => (
            <button key={g.id} className="chip group small" onClick={() => go(groupHref(g.id))}>{g.name}</button>
          ))}
        </div>
      )}
      {feat.profile && <PersonProfileSection person={person} entries={mine} />}
      <FoldHeader label={t('{name}に話したこと', { name: person.name })} count={mine.length} open={entriesOpen} onToggle={() => setEntriesOpen(!entriesOpen)} />
      {entriesOpen && <>
        {mine.length > 3 && <SearchBox value={q} onChange={setQ} placeholder={t('{name}に話したことを検索', { name: person.name })} />}
        {mine.length > 1 && (
          <div className="toolbar">
            <span className="count">{t('{n}件', { n: shown.length })}</span>
            <SortSelect value={sort} options={DETAIL_SORTS} onChange={setSort} />
          </div>
        )}
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
        <EntryList entries={shown} data={data} hidePersonId={id} empty={mine.length ? t('該当なし') : t('まだ話題がありません')} />
      </>}
      {feat.schedule && <PersonSchedule person={person} />}
      {feat.schedule && feat.todo && <PersonTodos person={person} />}
      <div className="section-title">{t('メモ')}</div>
      <PersonMemo id={id} memo={person.memo} />
      <AddEntryFab to={`/new?person=${id}`} label={t('＋ {name}に話したことを記録', { name: person.name })} />
    </div>
  );
}

// ---- タグの詳細: このタグの会話と、話した相手 ----
export function TopicScreen({ id }: { id: ID }) {
  const data = useData();
  const store = useStore();
  const feat = useFeatures();
  const topic = data.topics.find((t) => t.id === id);
  useEffect(() => { store.markViewed('topic', id); }, [store, id]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [reading, setReading] = useState('');
  const [tfolder, setTfolder] = useState<ID | null>(null);
  const tdirty = editing && !!topic && (name !== topic.name || reading !== (topic.reading ?? '') || tfolder !== (topic.folderId ?? null));
  const saveTopic = async () => {
    if (!name.trim()) return false;
    await store.updateTopic(id, { name: name.trim(), reading: reading.trim(), folderId: tfolder });
    setEditing(false);
  };
  const tguard = useDiscardGuard(tdirty, name.trim() ? saveTopic : undefined);
  const [sort, setSort] = usePref<EntrySort>('detailSort', 'newest');
  const [personFilter, setPersonFilter] = useState<ID | null>(null);
  const [entriesOpen, setEntriesOpen] = useFold('topic-entries');

  const entries = useMemo(() => data.entries.filter((e) => e.topics.some((t) => t.topicId === id)), [data, id]);
  const people = useMemo(() => {
    const m = new Map<ID, number>();
    for (const e of entries) for (const p of e.personIds) m.set(p, (m.get(p) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const shown = sortEntriesBy(personFilter && people.some(([id]) => id === personFilter) ? entries.filter((e) => e.personIds.includes(personFilter)) : entries, sort);

  if (!topic) return <Missing />;
  return (
    <div className="screen">
      <Header
        title={`#${topic.name}`}
        left={<button className="link" onClick={() => confirmLeave(() => back('/topics'))}>{t('‹ タグ')}</button>}
        right={<span className="header-actions"><FavToggle kind="topic" id={id} on={!!topic.favorite} className="in-header" /><button className="link" aria-expanded={editing} onClick={() => { if (editing) { tguard.guard(() => setEditing(false)); return; } setName(topic.name); setReading(topic.reading ?? ''); setTfolder(topic.folderId ?? null); setEditing(true); }}>{editing ? t('閉じる') : t('編集')}</button></span>}
      />
      {tguard.sheet}
      {editing && (
        <section className="form detail-edit">
          <section className="field">
            <label>{t('タグの名前')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          {currentLang() === 'ja' && (
            <section className="field">
              <label>{t('読み仮名（検索用）')}</label>
              <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder={t('例：りょこう')} />
            </section>
          )}
          {feat.folders && <section className="field">
            <label>{t('フォルダ')}</label>
            <FolderSelect scope="topic" value={tfolder} onChange={setTfolder} />
          </section>}
          <button className="btn primary block" disabled={!name.trim()} onClick={saveTopic}>
            {t('保存')}
          </button>
          <MergeBox kind="topic" id={id} name={topic.name} />
          <button className="btn danger block" onClick={async () => {
            if (!confirm(t('「{name}」を削除しますか？\n話題は残り、このタグだけ外れます。', { name: '#' + topic.name }))) return;
            await store.deleteTopic(id);
            back('/topics');
          }}>
            {t('このタグを削除')}
          </button>
        </section>
      )}
      <FoldHeader label={t('このタグの話題')} count={entries.length} open={entriesOpen} onToggle={() => setEntriesOpen(!entriesOpen)} />
      {entriesOpen && <>
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
        {entries.length > 1 && (
          <div className="toolbar">
            <span className="count">{t('{n}件', { n: shown.length })}</span>
            <SortSelect value={sort} options={DETAIL_SORTS} onChange={setSort} />
          </div>
        )}
        <EntryList entries={shown} data={data} hideTopicId={id} empty={t('まだ話題がありません')} />
      </>}
      <AddEntryFab to={`/new?topic=${id}`} label={t('＋ {name}の話題を追加', { name: '#' + topic.name })} />
    </div>
  );
}

// 人・タグの詳細の右下「＋」。押すとその人／タグを紐づけた新しい話題を作る
function AddEntryFab({ to, label }: { to: string; label: string }) {
  const selecting = useInteract().sel.active;
  if (selecting) return null;
  // 長押しで、その人／タグに関係なく話題・人・タグを作ることもできる
  const items = createItems({
    first: { icon: <Icon name="entry" />, label, run: () => go(to) },
    entry: '/new', people: '/people/new', topics: '/topics/new',
  });
  return <Fab label={label} onTap={() => go(to)} items={items} />;
}

// 人のメモ。「編集」を開かなくても、タップしてその場で書き換えられる
function PersonMemo({ id, memo }: { id: ID; memo: string }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(memo);
  const save = async () => { if (draft !== memo) await store.updatePerson(id, { memo: draft }); setOpen(false); };
  const { guard, sheet } = useDiscardGuard(open && draft !== memo, save);
  if (open) {
    return (
      <div className="memo-edit">
        <textarea className="textarea" rows={5} ref={autoFocusRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('メモ（関係・好きなものなど）')} />
        <div className="memo-actions">
          <button className="link" onClick={() => guard(() => { setDraft(memo); setOpen(false); })}>{t('キャンセル')}</button>
          <button className="link strong" onClick={save}>{t('保存')}</button>
        </div>
        {sheet}
      </div>
    );
  }
  return memo
    ? <button className="memo memo-tap" onClick={() => { setDraft(memo); setOpen(true); }} aria-label={t('メモを編集')}>{memo}</button>
    : <button className="link small-link memo-add" onClick={() => { setDraft(''); setOpen(true); }}>{t('＋ メモを書く')}</button>;
}

function Missing() {
  return (
    <div className="screen">
      <Header title="" left={<button className="link" onClick={() => back()}>{t('‹ 戻る')}</button>} />
      <div className="empty">{t('見つかりませんでした（削除された可能性があります）')}</div>
    </div>
  );
}

// iPhoneのメモと同じく、見出しの右上のアイコンでフォルダを作る
function FolderAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-btn folder-add" onClick={onClick} aria-label={t('新しいフォルダ')} title={t('新しいフォルダ')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2h8.8A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
        <path d="M12 11v5M9.5 13.5h5" />
      </svg>
    </button>
  );
}
