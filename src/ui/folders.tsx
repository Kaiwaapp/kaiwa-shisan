import { useState } from 'react';
import type { Folder, FolderScope, ID } from '../core/types';
import { folderDescendants, foldersOf } from '../core/store';
import { go, useData, useStore } from './hooks';

/** 各タブのフォルダのURL。記録は '' 、人は '/people'、話題は '/topics' */
export const SCOPE_BASE: Record<FolderScope, string> = { entry: '', person: '/people', topic: '/topics' };
export const SCOPE_LABEL: Record<FolderScope, string> = { entry: '記録', person: '人', topic: '話題' };
export const rootHref = (scope: FolderScope) => SCOPE_BASE[scope] || '/';
export const folderHref = (scope: FolderScope, id: ID | null) => (id ? `${SCOPE_BASE[scope]}/f/${id}` : rootHref(scope));
export const allHref = (scope: FolderScope) => `${SCOPE_BASE[scope]}/all`;

/** 一番上へ・途中の階層へ戻るためのパンくず(2階層以上のとき) */
export function Crumbs({ scope, path }: { scope: FolderScope; path: Folder[] }) {
  if (path.length < 2) return null;
  return (
    <nav className="crumbs">
      <button className="link" onClick={() => location.replace('#' + rootHref(scope))}>⌂ {SCOPE_LABEL[scope]}</button>
      {path.slice(0, -1).map((f) => (
        <span key={f.id}>
          <span className="sep">›</span>
          <button className="link" onClick={() => location.replace('#' + folderHref(scope, f.id))}>{f.name}</button>
        </span>
      ))}
      <span className="sep">›</span>
      <span className="here">{path[path.length - 1].name}</span>
    </nav>
  );
}

/** フォルダの行の一覧(「すべて」行・子フォルダ・新規フォルダ入力) */
export function FolderRows({ scope, folderId, children, count, total, adding, setAdding }: {
  scope: FolderScope;
  folderId: ID | null;
  children: Folder[];
  count: (id: ID) => number;
  total: number;
  adding: boolean;
  setAdding: (v: boolean) => void;
}) {
  const data = useData();
  const store = useStore();
  const [name, setName] = useState('');
  const showAll = !folderId && foldersOf(data.folders, scope).length > 0;
  if (!showAll && children.length === 0 && !adding) return null;
  const create = async () => {
    if (!name.trim()) return;
    await store.addFolder(name, folderId, scope);
    setName('');
    setAdding(false);
  };
  return (
    <ul className="rows folder-rows">
      {showAll && (
        <li className="row-item" onClick={() => go(allHref(scope))}>
          <span className="name"><span className="folder-icon">▦</span>すべての{SCOPE_LABEL[scope]}</span>
          <span className="sub">{total}</span>
          <span className="chev">›</span>
        </li>
      )}
      {children.map((f) => (
        <li key={f.id} className="row-item" onClick={() => go(folderHref(scope, f.id))}>
          <span className="name"><span className="folder-icon">▤</span>{f.name}</span>
          <span className="sub">{count(f.id)}</span>
          <span className="chev">›</span>
        </li>
      ))}
      {adding && (
        <li className="row-edit">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新しいフォルダの名前"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) create(); }}
          />
          <div className="row-actions">
            <button className="btn small primary" disabled={!name.trim()} onClick={create}>作成</button>
            <button className="btn small" onClick={() => { setAdding(false); setName(''); }}>やめる</button>
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
        if (!confirm(`フォルダ「${folder.name}」を削除しますか？\n中身は消えず、1つ上の階層に移ります。`)) return;
        const up = folder.parentId;
        await store.deleteFolder(id);
        location.replace('#' + folderHref(scope, up));
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

/** 人・話題の編集画面で入れるフォルダを選ぶ */
export function FolderSelect({ scope, value, onChange }: { scope: FolderScope; value: ID | null; onChange: (v: ID | null) => void }) {
  const data = useData();
  const choices = folderChoices(foldersOf(data.folders, scope));
  return (
    <select className="select block" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">一番上（フォルダなし）</option>
      {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  );
}
