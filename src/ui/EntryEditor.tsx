import { useEffect, useMemo, useState } from 'react';
import { today, type ID } from '../core/types';
import { back, useData, useStore } from './hooks';
import { ComboPicker, Header } from './components';
import { copyText } from './interact';
import { normalize } from '../core/search';
import { useEntryAi } from './AiTools';
import { t } from '../i18n';


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
  const [title, setTitle] = useState(existing?.title ?? '');
  const [text, setText] = useState(existing?.text ?? '');
  const [personIds, setPersonIds] = useState<ID[]>(existing?.personIds ?? (initialPerson ? [initialPerson] : []));
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<ID[]>(existing?.topics.map((t) => t.topicId) ?? (initialTopic ? [initialTopic] : []));
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [talkedOn, setTalkedOn] = useState(existing?.talkedOn ?? today());
  const [saving, setSaving] = useState(false);
  const [aiTopicIds, setAiTopicIds] = useState<ID[]>([]);
  const [aiNewTopics, setAiNewTopics] = useState<string[]>([]);

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

  const nameIs = (a: string, b: string) => normalize(a.trim()) === normalize(b.trim());
  const ai = useEntryAi({
    text,
    setText,
    knownPeople: data.people.map((p) => p.name),
    knownTopics: data.topics.map((t) => t.name),
    chosenPeople: [...data.people.filter((p) => personIds.includes(p.id)).map((p) => p.name), ...newPeople],
    chosenTopics: [...data.topics.filter((t) => topicIds.includes(t.id)).map((t) => t.name), ...newTopics],
    addPerson: (name) => {
      const found = data.people.find((p) => nameIs(p.name, name));
      if (found) {
        setPersonIds((xs) => (xs.includes(found.id) ? xs : [...xs, found.id]));
        store.markSelected('person', found.id);
      } else setNewPeople((xs) => (xs.some((x) => nameIs(x, name)) ? xs : [...xs, name]));
    },
    addTopic: (name) => {
      const found = data.topics.find((t) => nameIs(t.name, name));
      if (found) {
        setTopicIds((xs) => (xs.includes(found.id) ? xs : [...xs, found.id]));
        setAiTopicIds((xs) => [...xs, found.id]);
        store.markSelected('topic', found.id);
      } else {
        setNewTopics((xs) => (xs.some((x) => nameIs(x, name)) ? xs : [...xs, name]));
        setAiNewTopics((xs) => [...xs, name]);
      }
    },
  });

  if (id && !existing) {
    return (
      <div className="screen">
        <Header title={t('記録')} left={<button className="link" onClick={() => back()}>{t('戻る')}</button>} />
        <div className="empty">{t('この記録は見つかりませんでした。')}</div>
      </div>
    );
  }

  const canSave = (text.trim().length > 0 || title.trim().length > 0) && !saving;
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    // 新しい記録は開いていたフォルダに入れる。既存の記録はフォルダを変えない(移動は長押し・ドラッグで)
    const folderId = existing ? undefined : (initialFolder ?? null);
    await store.saveEntry({ title, text, personIds, newPeople, topicIds, newTopics, aiTopicIds, aiNewTopics, talkedOn, folderId }, id);
    back();
  };
  const remove = async () => {
    if (!id || !confirm(t('この記録を削除しますか？\n30日間は「最近削除した項目」から戻せます。'))) return;
    await store.deleteEntry(id);
    back();
  };

  return (
    <div className="screen editor">
      <Header
        title={existing ? t('記録を編集') : t('新しい記録')}
        left={<button className="link" onClick={() => back()}>{t('キャンセル')}</button>}
        right={<button className="link strong" disabled={!canSave} onClick={save}>{t('保存')}</button>}
      />
      <div className="form">
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // 変換確定のEnterでは移動しない
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
            }
          }}
          placeholder={t('タイトル（なくてもOK）')}
          aria-label={t('タイトル')}
          enterKeyHint="next"
        />
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={ai.onPaste}
          placeholder={t('話した内容を自由に書く')}
          autoFocus={!existing}
          rows={6}
        />
        {text.trim() && (
          <button type="button" className="link small-link copy-line" onClick={() => copyText(text)}>{t('⧉ 本文をコピー')}</button>
        )}
        {ai.panel}
        <section className="field">
          <label>{t('話した相手')}</label>
          <ComboPicker
            kind="person"
            options={personOpts}
            selected={personIds}
            newNames={newPeople}
            onChange={(s, n) => { pick('person', personIds, s); setPersonIds(s); setNewPeople(n); }}
          />
        </section>
        <section className="field">
          <label>{t('話題')}</label>
          <ComboPicker
            kind="topic"
            options={topicOpts}
            selected={topicIds}
            newNames={newTopics}
            onChange={(s, n) => { pick('topic', topicIds, s); setTopicIds(s); setNewTopics(n); }}
          />
        </section>
        <section className="field row">
          <label htmlFor="talkedOn">{t('最初に話した日')}</label>
          <input id="talkedOn" type="date" value={talkedOn} onChange={(e) => setTalkedOn(e.target.value || today())} />
        </section>
        {existing && (
          <button className="btn danger block" onClick={remove}>
            {t('この記録を削除')}
          </button>
        )}
      </div>
    </div>
  );
}
