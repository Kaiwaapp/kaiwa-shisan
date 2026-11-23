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

export function useAiSettings(): [AiSettings, (patch: Partial<AiSettings>) => void] {
  const [s, setS] = useState(loadAiSettings);
  useEffect(() => {
    const off = onAiSettings(setS);
    return () => { off(); };
  }, []);
  return [s, (patch) => saveAiSettings({ ...loadAiSettings(), ...patch })];
}

const yenText = (y: number) => (y < 0.01 ? '0.01円未満' : y < 1 ? `約${y.toFixed(2)}円` : `約${y.toFixed(1)}円`);

/** 記録の編集画面で使う。スクショ文字起こしボタン・貼り付け対応・話題/相手の提案 */
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
      if (!r.text) throw new Error('文字が見つかりませんでした');
      opts.setText((prev) => (prev.trim() ? prev.replace(/\s*$/, '') + '\n\n' : '') + r.text);
      setInfo(isDemo(s) ? 'お試し表示です(APIキー未設定のためサンプルの文章)' : `文字起こししました(${yenText(r.yen)})`);
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
      setInfo(isDemo(s) ? 'お試し表示です(APIキー未設定のため簡易的な提案)。タップで追加できます' : `提案しました(${yenText(r.yen)})。タップで追加できます`);
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
            {busy === 'ocr' ? '文字起こし中…' : '📷 スクショから文字起こし'}
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
          {busy === 'suggest' ? '考え中…' : '✨ 話題と相手を提案'}
        </button>
      )}
    </div>
  );

  const status = (err || info) && <p className={err ? 'ai-msg error' : 'ai-msg'}>{err || info}</p>;

  const suggestions = sug && (restTopics.length > 0 || restPeople.length > 0) && (
    <div className="ai-sug">
      <div className="ai-sug-head">
        <span className="muted small">AIの提案</span>
        <button
          className="link small"
          onClick={() => {
            restPeople.forEach(opts.addPerson);
            restTopics.forEach(opts.addTopic);
          }}
        >
          すべて追加
        </button>
        <button className="link small muted" onClick={() => setSug(null)}>閉じる</button>
      </div>
      <div className="chips">
        {restPeople.map((n) => (
          <button key={'p' + n} className="chip person" onClick={() => opts.addPerson(n)}>
            ＋ {n}{!isKnown(opts.knownPeople, n) && <span className="n"> 新</span>}
          </button>
        ))}
        {restTopics.map((n) => (
          <button key={'t' + n} className="chip topic" onClick={() => opts.addTopic(n)}>
            ＋ #{n}{!isKnown(opts.knownTopics, n) && <span className="n"> 新</span>}
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
  const [key, setKey] = useState(s.apiKey);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const [testing, setTesting] = useState(false);

  const saveKey = () => {
    update({ apiKey: key.trim() });
    setMsg(key.trim() ? 'APIキーを保存しました' : 'APIキーを消しました');
  };
  const test = async () => {
    setTesting(true); setMsg('');
    try {
      update({ apiKey: key.trim() });
      await testApiKey(key);
      setMsg('つながりました。使える状態です');
    } catch (e) {
      setMsg(aiErrorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="panel">
      <h2>AI機能（試作）</h2>
      <p className="muted small">
        Claude（Haiku）を使って、スクショの文字起こしと、話題・相手の提案をします。1回あたりおよそ0.1円以下です。
        試作版では、あなた自身のAPIキーをこの端末の中だけに保存して使います。
      </p>
      <label className="toggle main">
        <input type="checkbox" checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        <span>AI機能を使う</span>
      </label>
      {s.enabled && (
        <div className="sub-toggles">
          <label className="toggle">
            <input type="checkbox" checked={s.ocr} onChange={(e) => update({ ocr: e.target.checked })} />
            <span>スクショから文字起こし</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.suggest} onChange={(e) => update({ suggest: e.target.checked })} />
            <span>話題と相手を自動で提案</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={s.organize} onChange={(e) => update({ organize: e.target.checked })} />
            <span>フォルダの自動整理</span>
          </label>
          {s.organize && (
            <div className="ai-bar">
              <button className="btn small" onClick={() => go('/organize/entry')}>📁 記録を整理</button>
              <button className="btn small" onClick={() => go('/organize/person')}>📁 人を整理</button>
              <button className="btn small" onClick={() => go('/organize/topic')}>📁 話題を整理</button>
            </div>
          )}
        </div>
      )}
      {s.enabled && isDemo(s) && (
        <p className="ai-msg">
          APIキーが未設定なので「お試し表示」です。ボタンや提案の画面は使えますが、AIは呼ばずにサンプルの結果を出します（料金はかかりません）。
        </p>
      )}
      <div className="row-input">
        <input
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="APIキー（sk-ant-…）"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="btn small" onClick={() => setShow(!show)}>{show ? '隠す' : '表示'}</button>
      </div>
      <button className="btn primary block" disabled={key.trim() === s.apiKey} onClick={saveKey}>キーを保存</button>
      <button className="btn block" disabled={!key.trim() || testing} onClick={test}>
        {testing ? '確認中…' : 'つながるか確認'}
      </button>
      {msg && <p className="notice">{msg}</p>}
      <p className="muted small">
        これまでに使った金額の目安: {yenText(s.spentYen)}{' '}
        {s.spentYen > 0 && <button className="link small" onClick={() => update({ spentYen: 0 })}>リセット</button>}
      </p>
      <p className="muted small">
        APIキーは <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Claude Console</a> で作れます。
        送った画像や本文はAnthropicに送信されますが、バックアップのファイルにキーは含まれません。
      </p>
    </section>
  );
}
