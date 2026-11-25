import { useState } from 'react';
import type { Folder, FolderScope, ID } from '../core/types';
import { folderDescendants, foldersOf } from '../core/store';
import { go, useData, useStore } from './hooks';
import { dropProps, SelectMark, useInteract, usePress, type ItemRef } from './interact';
import { t } from '../i18n';

/** 各タブのフォルダのURL。記録は '' 、人は '/people'、話題は '/topics' */
export const SCOPE_BASE: Record<FolderScope, string> = { entry: '', person: '/people', topic: '/topics' };
/** 表示時に t() を通す */
export const SCOPE_LABEL: Record<FolderScope, string> = { entry: '記録', person: '人', topic: '話題' };
const ALL_LABEL: Record<FolderScope, string> = { entry: 'すべての記録', person: 'すべての人', topic: 'すべての話題' };
export const rootHref = (scope: FolderScope) => SCOPE_BASE[scope] || '/';
export const folderHref = (scope: FolderScope, id: ID | null) => (id ? `${SCOPE_BASE[scope]}/f/${id}` : rootHref(scope));
export const allHref = (scope: FolderScope) => `${SCOPE_BASE[scope]}/all`;
export const favHref = (scope: FolderScope) => `${SCOPE_BASE[scope]}/fav`;

/** 見出し行の左端に出すアイコン: お気に入り一覧と「すべての記録/人/話題」へ */
export function TitleIcons({ scope }: { scope: FolderScope }) {
  return (
    <span className="title-icons">
      <button className="icon-btn fav" aria-label={t('お気に入り')} title={t('お気に入り')} onClick={() => go(favHref(scope))}>★</button>
      <button className="icon-btn all" aria-label={t(ALL_LABEL[scope])} title={t(ALL_LABEL[scope])} onClick={() => go(allHref(scope))}>All</button>
    </span>
  );
}

/** 一番上へ・途中の階層へ戻るためのパンくず(2階層以上のとき) */
export function Crumbs({ scope, path }: { scope: FolderScope; path: Folder[] }) {
  if (path.length < 2) return null;
  return (
    <nav className="crumbs">
      <button className="link" {...dropProps(scope, null, t('一番上'))} onClick={() => location.replace('#' + rootHref(scope))}>⌂ {t(SCOPE_LABEL[scope])}</button>
      {path.slice(0, -1).map((f) => (
        <span key={f.id}>
          <span className="sep">›</span>
          <button className="link" {...dropProps(scope, f.id, f.name)} onClick={() => location.replace('#' + folderHref(scope, f.id))}>{f.name}</button>
        </span>
      ))}
      <span className="sep">›</span>
      <span className="here">{path[path.length - 1].name}</span>
    </nav>
  );
}

/** フォルダの行の一覧(子フォルダ・新規フォルダ入力)。「すべて」は見出しのアイコン(TitleIcons)から */
export function FolderRows({ scope, folderId, children, count, adding, setAdding }: {
  scope: FolderScope;
  folderId: ID | null;
  children: Folder[];
  count: (id: ID) => number;
  adding: boolean;
  setAdding: (v: boolean) => void;
}) {
  const store = useStore();
  const [name, setName] = useState('');
  if (children.length === 0 && !adding) return null;
  const create = async () => {
    if (!name.trim()) return;
    await store.addFolder(name, folderId, scope);
    setName('');
    setAdding(false);
  };
  return (
    <ul className="rows folder-rows">
      {children.map((f) => (
        <FolderRow key={f.id} scope={scope} folder={f} count={count(f.id)} />
      ))}
      {adding && (
        <li className="row-edit">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('新しいフォルダの名前')}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) create(); }}
          />
          <div className="row-actions">
            <button className="btn small primary" disabled={!name.trim()} onClick={create}>{t('作成')}</button>
            <button className="btn small" onClick={() => { setAdding(false); setName(''); }}>{t('やめる')}</button>
          </div>
        </li>
      )}
    </ul>
  );
}

/** あるフォルダ以下(子孫含む)に入っている項目数を数える関数 */
export function makeDeepCount(folders: Folder[], items: { folderId?: ID | null }[]) {
  const direct = new Map<string, number>();
  for (const x of items) if (x.folderId) direct.set(x.folderId, (direct.get(x.folderId) ?? 0) + 1);
  return (id: ID) => [id, ...folderDescendants(folders, id)].reduce((n, x) => n + (direct.get(x) ?? 0), 0);
}

/** フォルダの名前変更・移動・削除 */
export function FolderEdit({ id, onDone }: { id: ID; onDone: () => void }) {
  const data = useData();
  const store = useStore();
  const { openClear } = useInteract();
  const folder = data.folders.find((f) => f.id === id)!;
  const scope = folder.scope ?? 'entry';
  const [name, setName] = useState(folder.name);
  const [parent, setParent] = useState(folder.parentId ?? '');
  const blocked = folderDescendants(data.folders, id);
  const choices = folderChoices(foldersOf(data.folders, scope)).filter((c) => c.id !== id && !blocked.has(c.id));
  const save = async () => {
    if (name.trim() !== folder.name) await store.renameFolder(id, name);
    if ((parent || null) !== folder.parentId) await store.moveFolder(id, parent || null);
    onDone();
  };
  return (
    <div className="form">
      <section className="field">
        <label>{t('フォルダの名前')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </section>
      <section className="field">
        <label>{t('入れる場所')}</label>
        <select className="select block" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">{t('一番上')}</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </section>
      <button className="btn primary block" disabled={!name.trim()} onClick={save}>{t('保存')}</button>
      {scope === 'entry' && (
        <button className="btn danger block" onClick={() => openClear(id)}>{t('中の記録をすべて削除')}</button>
      )}
      <button className="btn danger block" onClick={async () => {
        if (!confirm(t('フォルダ「{name}」を削除しますか？\n中身は消えず、1つ上の階層に移ります。', { name: folder.name }))) return;
        const up = folder.parentId;
        await store.deleteFolder(id);
        location.replace('#' + folderHref(scope, up));
      }}>
        {t('このフォルダを削除')}
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

/** 人・話題の編集画面で入れるフォルダを選ぶ */
export function FolderSelect({ scope, value, onChange }: { scope: FolderScope; value: ID | null; onChange: (v: ID | null) => void }) {
  const data = useData();
  const choices = folderChoices(foldersOf(data.folders, scope));
  return (
    <select className="select block" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('一番上（フォルダなし）')}</option>
      {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  );
}

function FolderRow({ scope, folder, count }: { scope: FolderScope; folder: Folder; count: number }) {
  const item: ItemRef = { kind: 'folder', id: folder.id, label: folder.name, scope };
  const { lifted, handlers } = usePress(item, () => go(folderHref(scope, folder.id)));
  return (
    <li className={`row-item pressable ${lifted ? 'lifted' : ''}`} {...dropProps(scope, folder.id, folder.name)} {...handlers}>
      <span className="name"><SelectMark item={item} /><span className="folder-icon">▤</span>{folder.name}</span>
      <span className="sub">{count}</span>
      <span className="chev">›</span>
    </li>
  );
}

/** 戻るボタン(1つ上へのドロップ先にもなる) */
export function UpButton({ scope, parent }: { scope: FolderScope; parent: Folder | undefined }) {
  return (
    <button
      className="link"
      {...dropProps(scope, parent?.id ?? null, parent?.name ?? t('一番上'))}
      onClick={() => location.replace('#' + folderHref(scope, parent?.id ?? null))}
    >
      ‹ {parent ? parent.name : t(SCOPE_LABEL[scope])}
    </button>
  );
}
