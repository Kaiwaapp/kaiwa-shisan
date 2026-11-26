import { useMemo, useState } from 'react';
import { normalize } from '../core/search';
import { PRESET_TOPICS, type PresetTopic } from '../core/presets';
import { back, go, useData, useStore } from './hooks';
import { Header } from './components';
import { toast } from './interact';
import { setFeature, useFeatures } from './features';
import { currentLang, t } from '../i18n';

const nameOf = (x: PresetTopic) => (currentLang() === 'ja' ? x.name : x.en);

/** 用意したタグリストから選んでまとめて登録する画面(#/topics/presets)。タグタブの案内と、設定の「機能とカスタマイズ」のタグから開く */
export function PresetTopicsScreen() {
  const store = useStore();
  const data = useData();
  const feat = useFeatures();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const have = useMemo(() => new Set(data.topics.map((x) => normalize(x.name))), [data.topics]);
  const isHave = (x: PresetTopic) => have.has(normalize(nameOf(x)));
  const free = PRESET_TOPICS.flatMap((c) => c.topics).filter((x) => !isHave(x));

  const toggle = (names: string[], on: boolean) => {
    const next = new Set(picked);
    for (const n of names) on ? next.add(n) : next.delete(n);
    setPicked(next);
  };
  const save = async () => {
    if (!picked.size || saving) return;
    setSaving(true);
    const ja = currentLang() === 'ja';
    const items = free.filter((x) => picked.has(x.name)).map((x) => ({ name: nameOf(x), reading: ja && feat.readingTopic ? x.reading : undefined }));
    const n = await store.addTopicsBulk(items);
    toast(t('{n}件のタグを登録しました', { n }));
    location.replace('#/topics');
  };
  const allOn = free.length > 0 && free.every((x) => picked.has(x.name));

  return (
    <div className="screen editor">
      <Header
        title={t('おすすめのタグ')}
        left={<button className="link" onClick={() => back('/topics')}>{t('キャンセル')}</button>}
        right={<button className="link strong" disabled={!picked.size || saving} onClick={save}>{t('登録')}</button>}
      />
      <div className="form">
        <p className="muted small">{t('会話によく出るタグを選んで、まとめて登録できます。登録済みのタグは選べません。')}</p>
        <div className="preset-bar">
          <span className="count">{t('{n}件を選択中', { n: picked.size })}</span>
          {free.length > 0 && <button className="link" onClick={() => toggle(free.map((x) => x.name), !allOn)}>{allOn ? t('すべて外す') : t('すべて選ぶ')}</button>}
        </div>
        {currentLang() === 'ja' && (
          <label className="toggle small-toggle">
            <input type="checkbox" checked={feat.readingTopic} onChange={(e) => setFeature('readingTopic', e.target.checked)} />
            <span>{t('読み仮名も登録する（検索用）')}</span>
          </label>
        )}
        {PRESET_TOPICS.map((c) => {
          const rest = c.topics.filter((x) => !isHave(x)).map((x) => x.name);
          const catOn = rest.length > 0 && rest.every((n) => picked.has(n));
          return (
            <section key={c.title} className="panel">
              <div className="preset-bar">
                <h2>{t(c.title)}</h2>
                {rest.length > 0 && <button className="link" onClick={() => toggle(rest, !catOn)}>{catOn ? t('外す') : t('すべて選ぶ')}</button>}
              </div>
              <div className="chips">
                {c.topics.map((x) => isHave(x) ? (
                  <span key={x.name} className="chip topic done">✓ {nameOf(x)}</span>
                ) : (
                  <button key={x.name} type="button" className={`chip topic ${picked.has(x.name) ? 'on' : ''}`} aria-pressed={picked.has(x.name)} onClick={() => toggle([x.name], !picked.has(x.name))}>
                    #{nameOf(x)}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        <button className="btn primary block" disabled={!picked.size || saving} onClick={save}>
          {picked.size ? t('選んだ{n}件を登録', { n: picked.size }) : t('タグを選んでください')}
        </button>
      </div>
    </div>
  );
}

/** タグタブの一番上に出す案内。「今後表示しない」で設定の presetHint をオフにする */
export function PresetHint() {
  const feat = useFeatures();
  if (!feat.presetHint) return null;
  return (
    <section className="panel preset-hint">
      <p>{t('会話によく出るタグ（趣味・食べ物・仕事など）を選んで、まとめて登録できます。')}</p>
      <div className="preset-bar">
        <button className="btn primary small-btn" onClick={() => go('/topics/presets')}>{t('タグを選んで登録')}</button>
        <button className="link muted" onClick={() => { setFeature('presetHint', false); toast(t('設定の「機能とカスタマイズ」のタグからいつでも開けます')); }}>{t('今後表示しない')}</button>
      </div>
    </section>
  );
}
