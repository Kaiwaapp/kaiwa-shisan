import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { today, type EntryImage, type ID } from '../core/types';
import { back, useData, useStore } from './hooks';
import { ComboPicker, FavButton, FavToggle, Header, sameNameHints } from './components';
import { copyText, Sheet, toast } from './interact';
import { normalize } from '../core/search';
import { useEntryAi } from './AiTools';
import { t } from '../i18n';
import { setFeature, useFeatures } from './features';
import { compressImage, ImageStrip } from './images';


export function EntryEditor({ id, initialPerson, initialTopic, initialFolder, initialGroup }: {
  id?: ID;
  initialPerson?: ID;
  initialTopic?: ID;
  initialFolder?: ID;
  /** グループの画面から開いたとき、そのグループを最初から相手に入れる */
  initialGroup?: ID;
}) {
  const store = useStore();
  const data = useData();
  const feat = useFeatures();
  const existing = id ? data.entries.find((e) => e.id === id) : undefined;
  useEffect(() => { if (id) store.markViewed('entry', id); }, [store, id]);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [text, setText] = useState(existing?.text ?? '');
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [memoOpen, setMemoOpen] = useState(!!existing?.memo);
  const [personIds, setPersonIds] = useState<ID[]>(() => existing?.personIds ?? (initialPerson ? [initialPerson] : []));
  const [groupIds, setGroupIds] = useState<ID[]>(() => existing?.groupIds ?? (initialGroup ? [initialGroup] : []));
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<ID[]>(existing?.topics.map((t) => t.topicId) ?? (initialTopic ? [initialTopic] : []));
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [talkedOn, setTalkedOn] = useState(existing?.talkedOn ?? today());
  const [saving, setSaving] = useState(false);
  // 新しい記録のお気に入り(保存時に付ける)。既存の記録は☆を押した時点で保存する
  const [newFav, setNewFav] = useState(false);
  const [aiTopicIds, setAiTopicIds] = useState<ID[]>([]);
  const [aiNewTopics, setAiNewTopics] = useState<string[]>([]);
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
        <Header title={t('記録')} left={<button className="link" onClick={() => back()}>{t('戻る')}</button>} />
        <div className="empty">{t('この記録は見つかりませんでした。')}</div>
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
  const save = async () => {
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
    // 新しい記録は開いていたフォルダに入れる。既存の記録はフォルダを変えない(移動は長押し・ドラッグで)
    const folderId = existing ? undefined : (initialFolder ?? null);
    try {
      await store.saveEntry({ title, text, ...(feat.memo ? { memo } : {}), personIds, groupIds, newPeople, topicIds, newTopics, aiTopicIds, aiNewTopics, talkedOn, folderId, imageIds, newImages: [...pendingImages.values()], ...(existing ? {} : { favorite: newFav }) }, id);
    } catch {
      // 保存に失敗したら入力はそのまま残して、もう一度押せるようにする
      saved.current = false;
      setSaving(false);
      toast(t('保存できませんでした。もう一度押してください'));
      return;
    }
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
        left={<button className="link" onClick={cancel}>{t('キャンセル')}</button>}
        right={
          <span className="header-actions">
            {existing
              ? <FavToggle kind="entry" id={existing.id} on={!!existing.favorite} className="in-header" />
              : <FavButton on={newFav} onToggle={() => setNewFav(!newFav)} className="in-header" />}
            <button className={`link strong ${hasContent ? '' : 'dim'}`} aria-disabled={!hasContent || saving || imgBusy > 0} onClick={save}>{saving ? t('保存中…') : t('保存')}</button>
          </span>
        }
      />
      <div className="form">
        {feat.title && <input
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
        />}
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder={t('話した内容を自由に書く')}
          autoFocus={!existing}
          rows={6}
        />
        {feat.copy && text.trim() && (
          <button type="button" className="link small-link copy-line" onClick={() => copyText(text)}>{t('⧉ 本文をコピー')}</button>
        )}
        {feat.memo && (memoOpen
          ? <textarea className="textarea memo-field" rows={2} autoFocus={!memo} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('メモ（相手の反応など）')} aria-label={t('メモ')} />
          : <button type="button" className="link small-link memo-add" onClick={() => setMemoOpen(true)}>{t('＋ メモを書く')}</button>)}
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
          <p className="muted small">{t('画像{n}枚が付いています（「使う機能」で画像の添付をオンにすると表示されます）', { n: imageIds.length })}</p>
        )}
        {ai.panel}
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
            onChange={(s, n) => { pick('person', personIds, s); setPersonIds(s); setNewPeople(n); }}
          />
        </section>
        <section className="field">
          <label>{t('話題')}</label>
          <ComboPicker
            kind="topic"
            options={topicOpts}
            suggest={feat.recent}
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
      {asking && (
        <Sheet title={t('保存されていません')} onClose={() => setAsking(false)} cancelLabel={t('編集を続ける')}>
          <p className="muted small sheet-note">{t('このまま戻ると、入力した内容は保存されません。')}</p>
          <label className="toggle sheet-check">
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
            <span>{t('今後表示しない')}</span>
          </label>
          {dontAsk && <p className="muted small sheet-note">{t('設定の「使う機能」でまた表示するようにできます')}</p>}
          {hasContent && !saving && <button className="sheet-item" onClick={() => { setAsking(false); if (dontAsk) setFeature('confirmDiscard', false); save(); }}><span className="ic">✓</span>{t('保存して戻る')}</button>}
          <button className="sheet-item danger" onClick={() => { if (dontAsk) setFeature('confirmDiscard', false); leave(); }}><span className="ic">✕</span>{t('保存せずに戻る')}</button>
        </Sheet>
      )}
    </div>
  );
}
