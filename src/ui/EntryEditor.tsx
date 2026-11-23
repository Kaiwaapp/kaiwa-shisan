import { useMemo, useState } from 'react';
import { today, type ID } from '../core/types';
import { back, useData, useStore } from './hooks';
import { ChipPicker, Header } from './components';

export function EntryEditor({ id, initialPerson, initialTopic }: { id?: ID; initialPerson?: ID; initialTopic?: ID }) {
  const store = useStore();
  const data = useData();
  const existing = id ? data.entries.find((e) => e.id === id) : undefined;
  const [text, setText] = useState(existing?.text ?? '');
  const [personIds, setPersonIds] = useState<ID[]>(existing?.personIds ?? (initialPerson ? [initialPerson] : []));
  const [topicIds, setTopicIds] = useState<ID[]>(existing?.topics.map((t) => t.topicId) ?? (initialTopic ? [initialTopic] : []));
  const [talkedOn, setTalkedOn] = useState(existing?.talkedOn ?? today());
  const [saving, setSaving] = useState(false);

  // よく使う順(最近話した記録に出てくるほど上)
  const rank = useMemo(() => {
    const r = new Map<ID, number>();
    for (const e of data.entries) {
      const w = e.updatedAt;
      for (const p of e.personIds) r.set(p, Math.max(r.get(p) ?? 0, w));
      for (const t of e.topics) r.set(t.topicId, Math.max(r.get(t.topicId) ?? 0, w));
    }
    return r;
  }, [data.entries]);
  const personOpts = data.people.map((p) => ({ id: p.id, name: p.name, rank: rank.get(p.id) ?? p.createdAt / 1e3 }));
  const topicOpts = data.topics.map((t) => ({ id: t.id, name: t.name, rank: rank.get(t.id) ?? t.createdAt / 1e3 }));

  const toggle = (list: ID[], set: (v: ID[]) => void) => (x: ID) =>
    set(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

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
    await store.saveEntry({ text, personIds, topicIds, talkedOn }, id);
    back();
  };
  const remove = async () => {
    if (!id || !confirm('この記録を削除しますか？')) return;
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
        <section className="field">
          <label>話した相手</label>
          <ChipPicker
            kind="person"
            options={personOpts}
            selected={personIds}
            onToggle={toggle(personIds, setPersonIds)}
            onCreate={async (name) => {
              const p = await store.addPerson(name);
              setPersonIds((l) => (l.includes(p.id) ? l : [...l, p.id]));
            }}
          />
        </section>
        <section className="field">
          <label>話題</label>
          <ChipPicker
            kind="topic"
            options={topicOpts}
            selected={topicIds}
            onToggle={toggle(topicIds, setTopicIds)}
            onCreate={async (name) => {
              const t = await store.addTopic(name);
              setTopicIds((l) => (l.includes(t.id) ? l : [...l, t.id]));
            }}
          />
        </section>
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
