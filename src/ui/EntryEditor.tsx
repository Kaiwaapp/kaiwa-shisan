import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { autoFocusRef, focusNoScroll } from './focus';
import { today, type EntryImage, type ID } from '../core/types';
import { back, useData, useStore } from './hooks';
import { ComboPicker, FavButton, FavToggle, Header, sameNameHints } from './components';
import { copyText, Sheet, toast } from './interact';
import type { ImportDraft } from '../core/importers';
import { normalize } from '../core/search';
import { useEntryAi } from './AiTools';
import { t } from '../i18n';
import { setFeature, useFeatures } from './features';
import { compressImage, ImageStrip } from './images';
import { HoldButton } from './fab';
import { guessReading } from './reading';

function NewNameReadings({ names, readings, onChange, auto, prefix = '' }: {
  names: string[];
  readings: (string | undefined)[];
  onChange: (readings: (string | undefined)[]) => void;
  auto: boolean;
  prefix?: string;
}) {
  return names.map((name, i) => (
    <label className="field" key={i}>
      {t('{name}の読み仮名（任意）', { name: prefix + name })}
      <input value={readings[i] ?? (auto ? guessReading(name) : '')} onChange={(e) => {
        const next = Array.from({ length: names.length }, (_, j) => readings[j]);
        next[i] = e.target.value;
        onChange(next);
      }} />
    </label>
  ));
}


export function EntryEditor({ id, initialPerson, initialTopic, initialFolder, initialGroup, initialReply }: {
  id?: ID;
  initialPerson?: ID;
  initialReply?: ImportDraft;
  initialTopic?: ID;
  initialFolder?: ID;
  /** グループの画面から開いたとき、そのグループを最初から相手に入れる */
  initialGroup?: ID;
}) {
  const store = useStore();
  const data = useData();
  const feat = useFeatures();
  const showTitle = feat.title || !!initialReply;
  const existing = id ? data.entries.find((e) => e.id === id) : undefined;
  useEffect(() => { if (id) store.markViewed('entry', id); }, [store, id]);
  const [title, setTitle] = useState(existing?.title ?? initialReply?.title ?? '');
  const [text, setText] = useState(existing?.text ?? initialReply?.text ?? '');
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [memoOpen, setMemoOpen] = useState(!!existing?.memo);
  const [replyNames] = useState(() => {
    const people = initialReply?.people.map((name) => ({ name, id: data.people.find((p) => normalize(p.name) === normalize(name))?.id })) ?? [];
    const tags = initialReply?.topics.map((name) => ({ name, id: data.topics.find((t) => normalize(t.name) === normalize(name))?.id })) ?? [];
    return { people, tags };
  });
  const [personIds, setPersonIds] = useState<ID[]>(() => existing?.personIds ?? (initialPerson ? [initialPerson] : replyNames.people.flatMap(({ id }) => id ? [id] : [])));
  const [groupIds, setGroupIds] = useState<ID[]>(() => existing?.groupIds ?? (initialGroup ? [initialGroup] : []));
  const [newPeople, setNewPeople] = useState(() => replyNames.people.filter(({ id }) => !id).map(({ name }) => name));
  const [topicIds, setTopicIds] = useState<ID[]>(() => existing?.topics.map((t) => t.topicId) ?? (initialTopic ? [initialTopic] : replyNames.tags.flatMap(({ id }) => id ? [id] : [])));
  const [newTopics, setNewTopics] = useState(() => replyNames.tags.filter(({ id }) => !id).map(({ name }) => name));
  const [personReadings, setPersonReadings] = useState<(string | undefined)[]>([]);
  const [topicReadings, setTopicReadings] = useState<(string | undefined)[]>([]);
  const [talkedOn, setTalkedOn] = useState(existing?.talkedOn ?? initialReply?.talkedOn ?? today());
  const [saving, setSaving] = useState(false);
  // 新しい話題のお気に入り(保存時に付ける)。既存の話題は☆を押した時点で保存する
  const [newFav, setNewFav] = useState(false);
  const [aiTopicIds, setAiTopicIds] = useState<ID[]>(() => replyNames.tags.flatMap(({ id }) => id ? [id] : []));
  const [aiNewTopics, setAiNewTopics] = useState(() => [...newTopics]);
  // 添付画像。新しく付けた画像は保存するまで端末に書き込まない(キャンセルしたら残らない)
  const [imageIds, setImageIds] = useState<ID[]>(existing?.imageIds ?? []);
  const [pendingImages, setPendingImages] = useState<Map<ID, EntryImage>>(() => new Map());
  const [imgBusy, setImgBusy] = useState(0);
  const [imgErr, setImgErr] = useState('');
  const imgInput = useRef<HTMLInputElement>(null);
  const attachImages = async (files: Blob[]) => {
    setImgErr('');
    setImgBusy((n) => n + files.length);
    for (const f of files) {
      try {
        const img = await compressImage(f);
        setPendingImages((m) => new Map(m).set(img.id, img));
        setImageIds((xs) => [...xs, img.id]);
      } catch (e) {
        setImgErr((e as Error).message || t('画像を読み込めませんでした'));
      } finally {
        setImgBusy((n) => n - 1);
      }
    }
  };

  // 候補は「最後に選択した順」。まだ選んだことがなければ、最後に話題で使った日時
  const used = useMemo(() => {
    const r = new Map<ID, number>();
    for (const e of data.entries) {
      for (const p of e.personIds) r.set(p, Math.max(r.get(p) ?? 0, e.updatedAt));
      for (const t of e.topics) r.set(t.topicId, Math.max(r.get(t.topicId) ?? 0, e.updatedAt));
    }
    return r;
  }, [data.entries]);
  const rankOf = (x: { id: ID; createdAt: number; selectedAt?: number }) => x.selectedAt ?? used.get(x.id) ?? x.createdAt;
  const hints = sameNameHints(data.people, data.groups);
  const personOpts = data.people.map((p) => ({ id: p.id, name: p.name, reading: p.reading, rank: rankOf(p), hint: hints.get(p.id) }));
  const groupOpts = useMemo(() => {
    const count = new Map<ID, number>();
    for (const p of data.people) for (const g of p.groupIds ?? []) count.set(g, (count.get(g) ?? 0) + 1);
    const usedG = new Map<ID, number>();
    for (const e of data.entries) for (const g of e.groupIds ?? []) usedG.set(g, Math.max(usedG.get(g) ?? 0, e.updatedAt));
    return data.groups.map((g) => ({ id: g.id, name: g.name, count: count.get(g.id) ?? 0, rank: g.selectedAt ?? usedG.get(g.id) ?? g.createdAt }));
  }, [data.groups, data.people, data.entries]);
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
    attachImage: feat.images ? (img) => { void attachImages([img]); } : undefined,
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

  // 開いた時点の内容。これと違えば「入力した」とみなし、キャンセル時に確認する
  const [initial] = useState(() => JSON.stringify([title, text, memo, personIds, groupIds, topicIds, talkedOn]));
  const dirty = !saving && (
    !!initialReply ||
    JSON.stringify([title, text, memo, personIds, groupIds, topicIds, talkedOn]) !== initial || newPeople.length > 0 || newTopics.length > 0 || newFav
  );
  const [asking, setAsking] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const saved = useRef(false);
  const leave = () => { saved.current = true; setAsking(false); back(); };
  const cancel = () => {
    if (dirty && feat.confirmDiscard) setAsking(true);
    else leave();
  };
  // ページを閉じる・再読み込みするときもブラウザの確認を出す
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const on = (e: BeforeUnloadEvent) => { if (dirtyRef.current && !saved.current) e.preventDefault(); };
    addEventListener('beforeunload', on);
    return () => removeEventListener('beforeunload', on);
  }, []);

  if (id && !existing) {
    return (
      <div className="screen">
        <Header title={t('話題')} left={<button className="link" onClick={() => back()}>{t('戻る')}</button>} />
        <div className="empty">{t('この話題は見つかりませんでした。')}</div>
      </div>
    );
  }

  const hasContent = text.trim().length > 0 || title.trim().length > 0;
  // 画像の貼り付け: AIの文字起こしがオンならそちら(設定により画像も添付)、オフなら画像として添付
  const onPaste = (e: ClipboardEvent) => {
    ai.onPaste(e);
    if (e.isDefaultPrevented() || !feat.images) return;
    const files = [...e.clipboardData.items].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();
    void attachImages(files);
  };
  /** stay: 保存したあと画面を移らず、この話題の編集画面に留まる */
  const save = async (stay = false) => {
    if (saving) return;
    // 押せない理由がわかるように、ボタンは無効にせずにお知らせする
    if (!hasContent) {
      toast(feat.title ? t('本文かタイトルを入力してください') : t('本文を入力してください'));
      return;
    }
    if (imgBusy > 0) {
      toast(t('画像を準備中…'));
      return;
    }
    setSaving(true);
    saved.current = true;
    // 新しい話題は開いていたフォルダに入れる。既存の話題はフォルダを変えない(移動は長押し・ドラッグで)
    const folderId = existing ? undefined : (initialFolder ?? null);
    let entry;
    try {
      entry = await store.saveEntry({ title, text, ...(feat.memo ? { memo } : {}), personIds, groupIds, newPeople: newPeople.map((name, i) => ({ name, reading: personReadings[i] })), topicIds, newTopics: newTopics.map((name, i) => ({ name, reading: topicReadings[i] })), aiTopicIds, aiNewTopics, talkedOn, folderId, imageIds, newImages: [...pendingImages.values()], ...(existing ? {} : { favorite: newFav }) }, id);
    } catch {
      // 保存に失敗したら入力はそのまま残して、もう一度押せるようにする
      saved.current = false;
      setSaving(false);
      toast(t('保存できませんでした。もう一度押してください'));
      return;
    }
    if (stay) {
      // 保存した内容で編集画面を開き直す(履歴は増やさないので、戻ると開く前の画面へ)
      saved.current = false;
      toast(t('保存しました'));
      location.replace(`#/edit/${entry.id}?saved=${Date.now()}`);
      return;
    }
    back();
  };
  const remove = async () => {
    if (!id || !confirm(t('この話題を削除しますか？\n30日間は「最近削除した項目」から戻せます。'))) return;
    await store.deleteEntry(id);
    back();
  };

  return (
    <div className="screen editor">
      <Header
        title={existing ? t('話題を編集') : t('新しい話題')}
        left={<button className="link" onClick={cancel}>{t('キャンセル')}</button>}
        right={
          <span className="header-actions">
            {existing
              ? <FavToggle kind="entry" id={existing.id} on={!!existing.favorite} className="in-header" />
              : <FavButton on={newFav} onToggle={() => setNewFav(!newFav)} className="in-header" />}
            <HoldButton
              className={`link strong ${hasContent ? '' : 'dim'}`}
              aria-disabled={!hasContent || saving || imgBusy > 0}
              title={t('保存(長押しで保存後の動きを選ぶ)')}
              onTap={() => save(feat.stayAfterSave)}
              holdDisabled={!hasContent || saving}
              menuTitle={t('保存')}
              items={[
                { icon: '↩', label: t('保存して戻る'), run: () => save() },
                { icon: '✓', label: t('保存してこの画面に留まる'), run: () => save(true) },
              ]}
            >{saving ? t('保存中…') : t('保存')}</HoldButton>
          </span>
        }
      />
      <div className="form">
        {showTitle && <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            // 変換確定のEnterでは移動しない
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const next = e.currentTarget.nextElementSibling as HTMLElement | null;
              if (next) focusNoScroll(next);
            }
          }}
          placeholder={t('タイトル（なくてもOK）')}
          aria-label={t('タイトル')}
          enterKeyHint="next"
        />}
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder={t('話した内容を自由に書く')}
          ref={!existing ? autoFocusRef : undefined}
          rows={6}
        />
        {((text.trim() && (feat.copy || 'share' in navigator)) || (showTitle && feat.copy && title.trim())) && (
          <div className="copy-row">
            {text.trim() && 'share' in navigator && (
              <button type="button" className="link small-link copy-line" onClick={() => navigator.share({ ...(title.trim() ? { title } : {}), text: title.trim() ? `${title}\n${text}` : text }).catch(() => {})}>{t('↑ 共有')}</button>
            )}
            {showTitle && feat.copy && title.trim() && (
              <button type="button" className="link small-link copy-line" onClick={(e) => copyText(title, e.currentTarget)}>{t('⧉ タイトルをコピー')}</button>
            )}
            {feat.copy && text.trim() && <button type="button" className="link small-link copy-line" onClick={(e) => copyText(text, e.currentTarget)}>{t('⧉ 本文をコピー')}</button>}
          </div>
        )}
        {feat.memo && (memoOpen
          ? <textarea className="textarea memo-field" rows={4} ref={!memo ? autoFocusRef : undefined} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('メモ（相手の反応など）')} aria-label={t('メモ')} />
          : <button type="button" className="link small-link memo-add" onClick={() => setMemoOpen(true)}>{t('＋ メモを書く')}</button>)}
        {feat.memo && feat.copy && memoOpen && memo.trim() && (
          <button type="button" className="link small-link copy-line" onClick={(e) => copyText(memo, e.currentTarget)}>{t('⧉ メモをコピー')}</button>
        )}
        {feat.images && (
          <div className="img-field">
            <ImageStrip ids={imageIds} pending={pendingImages} onRemove={(x) => setImageIds((xs) => xs.filter((y) => y !== x))} />
            <button type="button" className="btn small" disabled={imgBusy > 0} onClick={() => imgInput.current?.click()}>
              {imgBusy > 0 ? t('画像を準備中…') : t('🖼 画像を添付')}
            </button>
            <input
              ref={imgInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length) void attachImages(files);
              }}
            />
            {imgErr && <p className="ai-msg error">{imgErr}</p>}
          </div>
        )}
        {!feat.images && imageIds.length > 0 && (
          <p className="muted small">{t('画像{n}枚が付いています（設定の「話題」で画像の添付をオンにすると表示されます）', { n: imageIds.length })}</p>
        )}
        {ai.panel}
        {(newPeople.length > 0 || newTopics.length > 0) && (
          <label className="toggle small-toggle">
            <input type="checkbox" checked={feat.entryReadingFields} onChange={(e) => setFeature('entryReadingFields', e.target.checked)} />
            {t('この画面で新規追加する人・タグの読み仮名欄を表示')}
          </label>
        )}
        <section className="field">
          <label>{t('話した相手')}</label>
          <ComboPicker
            kind="person"
            options={personOpts}
            groups={feat.groups ? groupOpts : []}
            selectedGroups={groupIds}
            onGroupsChange={(g) => { for (const x of g) if (!groupIds.includes(x)) store.markSelected('group', x); setGroupIds(g); }}
            suggest={feat.recent}
            allowSameName
            selected={personIds}
            newNames={newPeople}
            onRemoveNew={(i) => setPersonReadings((xs) => xs.filter((_, j) => j !== i))}
            onChange={(s, n) => { pick('person', personIds, s); setPersonIds(s); setNewPeople(n); }}
          />
          {feat.entryReadingFields && <NewNameReadings names={newPeople} readings={personReadings} onChange={setPersonReadings} auto={feat.readingPerson} />}
        </section>
        <section className="field">
          <label>{t('タグ')}</label>
          <ComboPicker
            kind="topic"
            options={topicOpts}
            suggest={feat.recent}
            selected={topicIds}
            newNames={newTopics}
            onRemoveNew={(i) => setTopicReadings((xs) => xs.filter((_, j) => j !== i))}
            onChange={(s, n) => { pick('topic', topicIds, s); setTopicIds(s); setNewTopics(n); }}
          />
          {feat.entryReadingFields && <NewNameReadings names={newTopics} readings={topicReadings} onChange={setTopicReadings} auto={feat.readingTopic} />}
        </section>
        <section className="field row">
          <label htmlFor="talkedOn">{t('最初に話した日')}</label>
          <input id="talkedOn" type="date" value={talkedOn} onChange={(e) => setTalkedOn(e.target.value || today())} />
        </section>
        {existing && (
          <button className="btn danger block" onClick={remove}>
            {t('この話題を削除')}
          </button>
        )}
      </div>
      {asking && (
        <Sheet title={t('保存されていません')} onClose={() => setAsking(false)} cancelLabel={t('編集を続ける')}>
          <p className="muted small sheet-note">{t('このまま戻ると、入力した内容は保存されません。')}</p>
          <label className="toggle sheet-check">
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
            <span>{t('今後表示しない')}</span>
          </label>
          {dontAsk && <p className="muted small sheet-note">{t('設定の「話題」でまた表示するようにできます')}</p>}
          {hasContent && !saving && <button className="sheet-item" onClick={() => { setAsking(false); if (dontAsk) setFeature('confirmDiscard', false); save(); }}><span className="ic">✓</span>{t('保存して戻る')}</button>}
          <button className="sheet-item danger" onClick={() => { if (dontAsk) setFeature('confirmDiscard', false); leave(); }}><span className="ic">✕</span>{t('保存せずに戻る')}</button>
        </Sheet>
      )}
    </div>
  );
}
