import { useEffect, useMemo, useState } from 'react';
import { today, type ID } from '../core/types';
import { back, useData, useStore } from './hooks';
import { ComboPicker, Header } from './components';
import { copyText } from './interact';
import { folderChoices } from './folders';
import { foldersOf } from '../core/store';

const NEW_FOLDER = '__new__';

export function EntryEditor({ id, initialPerson, initialTopic, initialFolder }: {
  id?: ID;
  initialPerson?: ID;
  initialTopic?: ID;
  initialFolder?: ID;
}) {
  const store = useStore();
  const data = useData();
  const existing = id ? data.entries.find((e) => e.id === id) : undefined;
  useEffect(() => { if (id) store.markViewed('entry', id); }, [store, id]);
  const [text, setText] = useState(existing?.text ?? '');
  const [personIds, setPersonIds] = useState<ID[]>(existing?.personIds ?? (initialPerson ? [initialPerson] : []));
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<ID[]>(existing?.topics.map((t) => t.topicId) ?? (initialTopic ? [initialTopic] : []));
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [talkedOn, setTalkedOn] = useState(existing?.talkedOn ?? today());
  const [folder, setFolder] = useState<string>(existing ? (existing.folderId ?? '') : (initialFolder ?? ''));
  const [newFolder, setNewFolder] = useState('');
  const [saving, setSaving] = useState(false);

  // 候補は「最後に選択した順」。まだ選んだことがなければ、最後に記録で使った日時
  const used = useMemo(() => {
    const r = new Map<ID, number>();
    for (const e of data.entries) {
      for (const p of e.personIds) r.set(p, Math.max(r.get(p) ?? 0, e.updatedAt));
      for (const t of e.topics) r.set(t.topicId, Math.max(r.get(t.topicId) ?? 0, e.updatedAt));
    }
    return r;
  }, [data.entries]);
  const rankOf = (x: { id: ID; createdAt: number; selectedAt?: number }) => x.selectedAt ?? used.get(x.id) ?? x.createdAt;
  const personOpts = data.people.map((p) => ({ id: p.id, name: p.name, reading: p.reading, rank: rankOf(p) }));
  const topicOpts = data.topics.map((t) => ({ id: t.id, name: t.name, reading: t.reading, rank: rankOf(t) }));
  const pick = (kind: 'person' | 'topic', prev: ID[], next: ID[]) => {
    for (const x of next) if (!prev.includes(x)) store.markSelected(kind, x);
  };

  if (id && !existing) {
    return (
      <div className="screen">
        <Header title="記録" left={<button className="link" onClick={() => back()}>戻る</button>} />
        <div className="empty">この記録は見つかりませんでした。</div>
      </div>
    );
  }

  const canSave = text.trim().length > 0 && !saving && !(folder === NEW_FOLDER && !newFolder.trim());
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    let folderId: ID | null = folder || null;
    if (folder === NEW_FOLDER) folderId = (await store.addFolder(newFolder)).id;
    await store.saveEntry({ text, personIds, newPeople, topicIds, newTopics, talkedOn, folderId }, id);
    back();
  };
  const remove = async () => {
    if (!id || !confirm('この記録を削除しますか？\n30日間は「最近削除した項目」から戻せます。')) return;
    await store.deleteEntry(id);
    back();
  };

  return (
    <div className="screen editor">
      <Header
        title={existing ? '記録を編集' : '新しい記録'}
        left={<button className="link" onClick={() => back()}>キャンセル</button>}
        right={<button className="link strong" disabled={!canSave} onClick={save}>保存</button>}
      />
      <div className="form">
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="話した内容を自由に書く"
          autoFocus={!existing}
          rows={6}
        />
        {text.trim() && (
          <button type="button" className="link small-link copy-line" onClick={() => copyText(text)}>⧉ 本文をコピー</button>
        )}
        <section className="field">
          <label>話した相手</label>
          <ComboPicker
            kind="person"
            options={personOpts}
            selected={personIds}
            newNames={newPeople}
            onChange={(s, n) => { pick('person', personIds, s); setPersonIds(s); setNewPeople(n); }}
          />
        </section>
        <section className="field">
          <label>話題</label>
          <ComboPicker
            kind="topic"
            options={topicOpts}
            selected={topicIds}
            newNames={newTopics}
            onChange={(s, n) => { pick('topic', topicIds, s); setTopicIds(s); setNewTopics(n); }}
          />
        </section>
        <section className="field row">
          <label htmlFor="folder">フォルダ</label>
          <select id="folder" className="select" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">一番上（フォルダなし）</option>
            {folderChoices(foldersOf(data.folders, 'entry')).map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
            <option value={NEW_FOLDER}>＋ 新しいフォルダ…</option>
          </select>
        </section>
        {folder === NEW_FOLDER && (
          <section className="field">
            <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="新しいフォルダの名前" autoFocus />
          </section>
        )}
        <section className="field row">
          <label htmlFor="talkedOn">話した日</label>
          <input id="talkedOn" type="date" value={talkedOn} onChange={(e) => setTalkedOn(e.target.value || today())} />
        </section>
        {existing && (
          <button className="btn danger block" onClick={remove}>
            この記録を削除
          </button>
        )}
      </div>
    </div>
  );
}
