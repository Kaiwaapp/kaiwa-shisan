import { useEffect, useMemo, useState } from 'react';
import { today, type ID } from '../core/types';
import { back, useData, useStore } from './hooks';
import { ComboPicker, Header } from './components';
import { copyText } from './interact';


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

  const canSave = text.trim().length > 0 && !saving;
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    // 新しい記録は開いていたフォルダに入れる。既存の記録はフォルダを変えない(移動は長押し・ドラッグで)
    const folderId = existing ? undefined : (initialFolder ?? null);
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
          <label htmlFor="talkedOn">最初に話した日</label>
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
