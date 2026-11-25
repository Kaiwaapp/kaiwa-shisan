import { useMemo, useState } from 'react';
import { normalize } from '../core/search';
import { PRESET_TOPICS, type PresetTopic } from '../core/presets';
import { back, go, useData, useStore } from './hooks';
import { Header } from './components';
import { toast } from './interact';
import { setFeature, useFeatures } from './features';
import { currentLang, t } from '../i18n';

const nameOf = (x: PresetTopic) => (currentLang() === 'ja' ? x.name : x.en);

/** 用意した話題リストから選んでまとめて登録する画面(#/topics/presets)。話題タブの案内と、設定の「機能とカスタマイズ」の話題から開く */
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
    toast(t('{n}件の話題を登録しました', { n }));
    location.replace('#/topics');
  };
  const allOn = free.length > 0 && free.every((x) => picked.has(x.name));

  return (
    <div className="screen editor">
      <Header
        title={t('おすすめの話題')}
        left={<button className="link" onClick={() => back('/topics')}>{t('キャンセル')}</button>}
        right={<button className="link strong" disabled={!picked.size || saving} onClick={save}>{t('登録')}</button>}
      />
      <div className="form">
        <p className="muted small">{t('会話によく出る話題を選んで、まとめて登録できます。登録済みの話題は選べません。')}</p>
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
          {picked.size ? t('選んだ{n}件を登録', { n: picked.size }) : t('話題を選んでください')}
        </button>
      </div>
    </div>
  );
}

/** 話題タブの一番上に出す案内。話題が少ないときだけ。「今後表示しない」で設定の presetHint をオフにする */
export function PresetHint({ count }: { count: number }) {
  const feat = useFeatures();
  if (!feat.presetHint || count >= 10) return null;
  return (
    <section className="panel preset-hint">
      <p>{t('会話によく出る話題（趣味・食べ物・仕事など）を選んで、まとめて登録できます。')}</p>
      <div className="preset-bar">
        <button className="btn primary small-btn" onClick={() => go('/topics/presets')}>{t('話題を選んで登録')}</button>
        <button className="link muted" onClick={() => { setFeature('presetHint', false); toast(t('設定の「機能とカスタマイズ」の話題からいつでも開けます')); }}>{t('今後表示しない')}</button>
      </div>
    </section>
  );
}
