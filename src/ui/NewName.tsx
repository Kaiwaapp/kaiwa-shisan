import { useState } from 'react';
import type { ID } from '../core/types';
import { normalize } from '../core/search';
import { back, useData, useStore } from './hooks';
import { Header } from './components';
import { currentLang, t } from '../i18n';
import { useAutoReading } from './reading';
import { setFeature, useFeatures } from './features';

/** 人タブ・話題タブの右下「＋」から開く、人／話題の新規追加画面 */
export function NewNameScreen({ kind, folderId }: { kind: 'person' | 'topic'; folderId: ID | null }) {
  const store = useStore();
  const data = useData();
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  // 設定の人・話題の欄と同じチェック。ここで変えると設定にも反映される
  const readingKey = kind === 'person' ? 'readingPerson' : 'readingTopic';
  const autoOn = useFeatures()[readingKey];
  const clean = name.trim().replace(kind === 'topic' ? /^#/ : /^$/, '');
  const { reading, setReading, isAuto } = useAutoReading(clean, '', autoOn);
  const list = kind === 'person' ? data.people : data.topics;
  const dup = clean ? list.find((x) => normalize(x.name) === normalize(clean)) : undefined;
  const base = kind === 'person' ? '#/people/' : '#/topics/';

  /** asNew: 同名の人がいても別の人として追加する */
  const save = async (asNew = false) => {
    if (!clean || saving) return;
    if (dup && !asNew) { location.replace(base + dup.id); return; }
    setSaving(true);
    let id: ID;
    if (kind === 'person') {
      const p = await store.addPerson(clean, folderId, [], asNew);
      if (reading.trim() || memo.trim()) await store.updatePerson(p.id, { reading: reading.trim(), memo });
      id = p.id;
    } else {
      const x = await store.addTopic(clean, folderId);
      if (reading.trim()) await store.updateTopic(x.id, { reading: reading.trim() });
      id = x.id;
    }
    // 追加画面を履歴に残さず、作った人／話題の画面に置き換える(戻ると一覧へ)
    location.replace(base + id);
  };

  return (
    <div className="screen editor">
      <Header
        title={kind === 'person' ? t('新しい人') : t('新しい話題')}
        left={<button className="link" onClick={() => back(kind === 'person' ? '/people' : '/topics')}>{t('キャンセル')}</button>}
        right={<button className="link strong" disabled={!clean || saving} onClick={() => save()}>{dup ? t('開く') : t('追加')}</button>}
      />
      <div className="form">
        <section className="field">
          <label>{kind === 'person' ? t('名前') : t('話題の名前')}</label>
          <input
            value={name}
            autoFocus
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } }}
            placeholder={kind === 'person' ? t('例：田中さん') : t('例：旅行')}
          />
          {dup && <p className="muted small">{kind === 'person' ? t('「{name}」はもういます', { name: dup.name }) : t('「{name}」はもうあります', { name: '#' + dup.name })}</p>}
          {dup && kind === 'person' && (
            <button type="button" className="link small-link" disabled={saving} onClick={() => save(true)}>{t('＋「{name}」を別の人として追加', { name: clean })}</button>
          )}
        </section>
        {currentLang() === 'ja' && (
          <section className="field">
            <label>{t('読み仮名（検索用）')}</label>
            <label className="toggle small-toggle">
              <input type="checkbox" checked={autoOn} onChange={(e) => setFeature(readingKey, e.target.checked)} />
              <span>{t('入力した文字から読み仮名を登録する')}</span>
            </label>
            <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder={kind === 'person' ? t('例：たなか') : t('例：りょこう')} />
            {isAuto && <p className="muted small">{t('名前の入力から読み仮名を入れました')}</p>}
          </section>
        )}
        {kind === 'person' && (
          <section className="field">
            <label>{t('メモ（関係・好きなものなど）')}</label>
            <textarea className="textarea" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </section>
        )}
      </div>
    </div>
  );
}
