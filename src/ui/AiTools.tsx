// AI機能の画面部品(試作)。設定でONにしたときだけ表示される。
import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import {
  aiErrorMessage,
  demoSuggest,
  demoTranscribe,
  isDemo,
  loadAiSettings,
  ocrReady,
  onAiSettings,
  saveAiSettings,
  suggestReady,
  suggestTags,
  testApiKey,
  transcribeImage,
  type AiSettings,
  type Suggestion,
} from '../core/ai';
import { normalize } from '../core/search';
import { go } from './hooks';
import { useFeatures } from './features';
import { t } from '../i18n';

export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => void] {
  const [s, setS] = useState(loadAiSettings);
  useEffect(() => {
    const off = onAiSettings(setS);
    return () => { off(); };
  }, []);
  return [s, (patch) => saveAiSettings({ ...loadAiSettings(), ...patch })];
}

export const yenText = (y: number) =>
  y < 0.01 ? t('0.01円未満') : t('約{v}円', { v: y < 1 ? y.toFixed(2) : y.toFixed(1) });

/** 話題の編集画面で使う。スクショ文字起こしボタン・貼り付け対応・タグ/相手の提案 */
export function useEntryAi(opts: {
  text: string;
  setText: (f: (prev: string) => string) => void;
  knownPeople: string[];
  knownTopics: string[];
  /** すでに付いている名前(提案から除く) */
  chosenPeople: string[];
  chosenTopics: string[];
  addPerson: (name: string) => void;
  addTopic: (name: string) => void;
  /** 文字起こしした画像を話題に添付する(設定でオンのときに呼ぶ)。未指定なら添付しない */
  attachImage?: (img: Blob) => void;
}) {
  const [s] = useAiSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'ocr' | 'suggest'>('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [sug, setSug] = useState<Suggestion | null>(null);

  const ocr = async (img: Blob) => {
    setBusy('ocr'); setErr(''); setInfo('');
    try {
      const r = isDemo(s) ? await demoTranscribe() : await transcribeImage(s.apiKey, img);
      if (!r.text) throw new Error(t('文字が見つかりませんでした'));
      opts.setText((prev) => (prev.trim() ? prev.replace(/\s*$/, '') + '\n\n' : '') + r.text);
      const attach = s.ocrAttach && opts.attachImage;
      if (attach) attach(img);
      setInfo(
        (isDemo(s) ? t('お試し表示です(APIキー未設定のためサンプルの文章)') : t('文字起こししました({v})', { v: yenText(r.yen) }))
        + (attach ? t('。画像も添付しました') : ''),
      );
    } catch (e) {
      setErr(aiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!ocrReady(s)) return;
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    const f = item?.getAsFile();
    if (!f) return;
    e.preventDefault();
    ocr(f);
  };

  const suggest = async () => {
    if (!opts.text.trim()) return;
    setBusy('suggest'); setErr(''); setInfo('');
    try {
      const known = { people: opts.knownPeople, topics: opts.knownTopics };
      const r = isDemo(s) ? await demoSuggest(opts.text, known) : await suggestTags(s.apiKey, opts.text, known);
      setSug({ topics: r.topics, people: r.people });
      setInfo(isDemo(s) ? t('お試し表示です(APIキー未設定のため簡易的な提案)。タップで追加できます') : t('提案しました({v})。タップで追加できます', { v: yenText(r.yen) }));
    } catch (e) {
      setErr(aiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const has = (xs: string[], n: string) => xs.some((x) => normalize(x) === normalize(n));
  const isKnown = (xs: string[], n: string) => has(xs, n);
  const restPeople = sug ? sug.people.filter((n) => !has(opts.chosenPeople, n)) : [];
  const restTopics = sug ? sug.topics.filter((n) => !has(opts.chosenTopics, n)) : [];

  const showOcr = ocrReady(s);
  const showSuggest = suggestReady(s);

  const toolbar = (showOcr || showSuggest) && (
    <div className="ai-bar">
      {showOcr && (
        <>
          <button className="btn small" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy === 'ocr' ? t('文字起こし中…') : t('📷 スクショから文字起こし')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) ocr(f);
              e.target.value = '';
            }}
          />
        </>
      )}
      {showSuggest && (
        <button className="btn small" disabled={!!busy || !opts.text.trim()} onClick={suggest}>
          {busy === 'suggest' ? t('考え中…') : t('✨ タグと相手を提案')}
        </button>
      )}
    </div>
  );

  const status = (err || info) && <p className={err ? 'ai-msg error' : 'ai-msg'}>{err || info}</p>;

  const suggestions = sug && (restTopics.length > 0 || restPeople.length > 0) && (
    <div className="ai-sug">
      <div className="ai-sug-head">
        <span className="muted small">{t('AIの提案')}</span>
        <button
          className="link small"
          onClick={() => {
            restPeople.forEach(opts.addPerson);
            restTopics.forEach(opts.addTopic);
          }}
        >
          {t('すべて追加')}
        </button>
        <button className="link small muted" onClick={() => setSug(null)}>{t('閉じる')}</button>
      </div>
      <div className="chips">
        {restPeople.map((n) => (
          <button key={'p' + n} className="chip person" onClick={() => opts.addPerson(n)}>
            ＋ {n}{!isKnown(opts.knownPeople, n) && <span className="n"> {t('新')}</span>}
          </button>
        ))}
        {restTopics.map((n) => (
          <button key={'t' + n} className="chip topic" onClick={() => opts.addTopic(n)}>
            ＋ #{n}{!isKnown(opts.knownTopics, n) && <span className="n"> {t('新')}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  return {
    onPaste,
    panel: (toolbar || status || suggestions) ? (
      <div className="ai-tools">
        {toolbar}
        {status}
        {suggestions}
      </div>
    ) : null,
  };
}

/** 設定画面の「AI機能(試作)」 */
export function AiSettingsPanel() {
  const [s, update] = useAiSettings();
  const feat = useFeatures();
  const [key, setKey] = useState(s.apiKey);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const [testing, setTesting] = useState(false);

  const saveKey = () => {
    update({ apiKey: key.trim() });
    setMsg(key.trim() ? t('APIキーを保存しました') : t('APIキーを消しました'));
  };
  const test = async () => {
    setTesting(true); setMsg('');
    try {
      update({ apiKey: key.trim() });
      await testApiKey(key);
      setMsg(t('つながりました。使える状態です'));
    } catch (e) {
      setMsg(aiErrorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="panel">
      <h2>{t('AI機能（試作）')}</h2>
      <p className="muted small">
        {t('スクショの文字起こし、タグ・相手の提案、フォルダの整理、プロフィールの自動入力をAI（Claude Haiku）が手伝います。APIキーがなければ「お試し表示」で画面と動きだけ確認できます。')}
      </p>
      <label className="toggle toggle-main">
        <input type="checkbox" checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        <span>{t('AI機能を使う')}</span>
      </label>
      {s.enabled && (
        <div className="sub-toggles">
          <label className="toggle">
            <input type="checkbox" checked={s.ocr} onChange={(e) => update({ ocr: e.target.checked })} />
            <span>{t('スクショから文字起こし')}</span>
          </label>
          {s.ocr && (
            <label className="toggle nested">
              <input type="checkbox" checked={s.ocrAttach} onChange={(e) => update({ ocrAttach: e.target.checked })} />
              <span>
                {t('文字起こしした画像を話題に添付する')}
                <span className="muted small block-note">
                  {feat.images ? t('オフにすると、文字だけを話題に入れて画像は残しません') : t('「機能とカスタマイズ」で画像の添付がオフのため、今は添付されません')}
                </span>
              </span>
            </label>
          )}
          <label className="toggle">
            <input type="checkbox" checked={s.suggest} onChange={(e) => update({ suggest: e.target.checked })} />
            <span>{t('タグと相手を自動で提案')}</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.organize} onChange={(e) => update({ organize: e.target.checked })} />
            <span>{t('フォルダの自動整理')}</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.profile} onChange={(e) => update({ profile: e.target.checked })} />
            <span>{t('プロフィールの自動入力')}</span>
          </label>
          {s.organize && (
            <div className="ai-bar">
              <button className="btn small" onClick={() => go('/organize/entry')}>{t('📁 話題を整理')}</button>
              <button className="btn small" onClick={() => go('/organize/person')}>{t('📁 人を整理')}</button>
              <button className="btn small" onClick={() => go('/organize/topic')}>{t('📁 タグを整理')}</button>
            </div>
          )}
        </div>
      )}
      {s.enabled && isDemo(s) && (
        <p className="ai-msg">
          {t('APIキーが未設定なので「お試し表示」です。ボタンや提案の画面は使えますが、AIは呼ばずにサンプルの結果を出します（料金はかかりません）。')}
        </p>
      )}
      <div className="row-input">
        <input
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('APIキー（sk-ant-…）')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="btn small" onClick={() => setShow(!show)}>{show ? t('隠す') : t('表示')}</button>
      </div>
      <button className="btn primary block" disabled={key.trim() === s.apiKey} onClick={saveKey}>{t('キーを保存')}</button>
      <button className="btn block" disabled={!key.trim() || testing} onClick={test}>
        {testing ? t('確認中…') : t('つながるか確認')}
      </button>
      {msg && <p className="notice">{msg}</p>}
      <p className="muted small">
        {t('これまでに使った金額の目安: {v}', { v: yenText(s.spentYen) })}{' '}
        {s.spentYen > 0 && <button className="link small" onClick={() => update({ spentYen: 0 })}>{t('リセット')}</button>}
      </p>
      <p className="muted small">
        {t('APIキーはClaude Consoleで作れます。APIを使うと画像や本文がAnthropicに送られます。キーはバックアップのファイルには含まれません。')}{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Claude Console</a>
      </p>
    </section>
  );
}
