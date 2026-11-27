// 他のアプリから取り込む画面(試作)。App.tsx から遅延読み込みされるので、普段の起動には影響しない。
import { useMemo, useRef, useState } from 'react';
import {
  aiToDrafts, guessSelf, guessSplit, lineToDrafts, parseAiExport, parseLine, parseReplyDraft, textToDrafts,
  type AiConversation, type ImportDraft, type LineChat, type TextSplit,
} from '../core/importers';
import { isZip, readZipText } from '../core/unzip';
import { demoSuggest, isDemo, suggestReady, suggestTags, aiErrorMessage } from '../core/ai';
import { foldersOf, type ImportResult } from '../core/store';
import { normalize } from '../core/search';
import { today } from '../core/types';
import { back, formatDate, go, useData, useStore } from './hooks';
import { Header, LoadMore, useIncremental } from './components';
import { folderChoices, folderHref } from './folders';
import { copyText } from './interact';
import { exportBackup } from './backupUi';
import { useAiSettings } from './AiTools';
import { addDict, t } from '../i18n';
import enImport from '../i18n/en-import';
import './import.css';

type Source = 'reply' | 'text' | 'line' | 'chatgpt' | 'claude';
const AI_NAME: Record<'chatgpt' | 'claude', string> = { chatgpt: 'ChatGPT', claude: 'Claude' };
const isAi = (s: Source): s is 'chatgpt' | 'claude' => s === 'chatgpt' || s === 'claude';
/** AIの返事は長いので、既定では先頭だけ残す */
const REPLY_MAX = 200;
type Step = 'source' | 'input' | 'preview' | 'done';

const AI_MAX = 30;
const splitNames = (text: string) => text.split(/[,、，]/).map((name) => name.trim()).filter(Boolean);

addDict('en', enImport);

export default function ImportScreen({ onOpenReply }: { onOpenReply: (draft: ImportDraft) => void }) {
  const [step, setStep] = useState<Step>('source');
  const [source, setSource] = useState<Source>('text');
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [convs, setConvs] = useState<AiConversation[] | null>(null);
  const [result, setResult] = useState<{ r: ImportResult; folderId: string | null; n: number } | null>(null);

  const pick = (s: Source) => { setSource(s); setRaw(''); setConvs(null); setFileName(''); setErr(''); setStep('input'); };

  const openReply = (editor: boolean) => {
    const draft = parseReplyDraft(raw);
    if (!draft) {
      setErr(t('返信案を読み取れませんでした。AIが返したJSONをコピーしてください。'));
      return;
    }
    if (editor) onOpenReply(draft);
    else setStep('preview');
  };

  const onBack = () => {
    if (step === 'input') setStep('source');
    else if (step === 'preview') setStep('input');
    else back('/settings');
  };

  const title = step === 'source' || step === 'done' ? t('取り込み') : source === 'reply' ? t('AIの返信案') : source === 'line' ? 'LINE' : isAi(source) ? AI_NAME[source] : t('メモ・テキスト');

  return (
    <div className="screen import">
      <Header title={title} left={<button className="link" onClick={onBack}>‹ {step === 'source' || step === 'done' ? t('設定') : t('戻る')}</button>} />
      {step === 'source' && <SourceStep onPick={pick} />}
      {step === 'input' && isAi(source) && (
        <AiInputStep
          service={source}
          fileName={fileName}
          count={convs?.length ?? null}
          onLoaded={(c, name) => { setConvs(c); setFileName(name); }}
          onNext={() => setStep('preview')}
        />
      )}
      {step === 'input' && source === 'reply' && (
        <div className="form">
          <ol className="howto">
            <li>{t('下のボタンで依頼文をコピーし、返信案を作ったChatGPTのチャットに送る')}</li>
            <li>{t('ChatGPTが返したJSONをコピーして、下の欄に貼り付ける')}</li>
            <li>{t('「記録画面に入力」で修正して保存するか、「読み込んで確認する」でそのまま取り込む')}</li>
          </ol>
          <button className="btn block" type="button" onClick={() => copyText(t('採用する返信案を会話資産に登録します。次のJSON形式だけで返してください。titleは短い見出し、textは採用する返信文そのもの、peopleはやり取りの相手（自分を除く）、tagsは再利用しやすい話題タグです。不明な相手は推測せず空配列にしてください。元のやり取りは含めないでください。') + '\n{"title":"","text":"","people":[],"tags":[]}')}>{t('チャットAIへの依頼文をコピー')}</button>
          <label className="field">
            {t('返信案のJSONを貼り付け')}
            <textarea className="textarea" value={raw} onChange={(e) => { setRaw(e.target.value); setErr(''); }} />
          </label>
          {err && <p className="ai-msg error" role="alert">{err}</p>}
          <button className="btn primary block" disabled={!raw.trim()} onClick={() => openReply(true)}>{t('記録画面に入力')}</button>
          <button className="btn block" disabled={!raw.trim()} onClick={() => openReply(false)}>{t('読み込んで確認する')}</button>
        </div>
      )}
      {step === 'input' && source !== 'reply' && !isAi(source) && (
        <InputStep
          source={source}
          raw={raw}
          fileName={fileName}
          err={err}
          onRaw={(v, name) => { setRaw(v); setFileName(name ?? ''); setErr(''); }}
          onNext={() => {
            if (source === 'line' && parseLine(raw).messages.length === 0) {
              setErr(t('LINEのトーク履歴として読み取れませんでした。「トーク履歴を送信」で保存した.txtを選んでください'));
              return;
            }
            setStep('preview');
          }}
        />
      )}
      {step === 'preview' && (
        <PreviewStep
          source={source}
          raw={raw}
          convs={convs ?? []}
          fileName={fileName}
          onDone={(r, folderId, n) => { setResult({ r, folderId, n }); setStep('done'); }}
        />
      )}
      {step === 'done' && result && <DoneStep {...result} onAgain={() => { setResult(null); setStep('source'); }} />}
    </div>
  );
}

function SourceStep({ onPick }: { onPick: (s: Source) => void }) {
  return (
    <div className="form">
      <p className="muted small pad">{t('今まで使っていたアプリの内容を、話題としてまとめて取り込めます。取り込む前に内容を確認・修正できます。')}</p>
      <button className="btn block" type="button" onClick={() => onPick('reply')}>{t('AIの返信案')}</button>
      <ul className="rows">
        <li className="row-item" onClick={() => onPick('text')}>
          <span className="name"><span className="src-icon">✎</span>{t('メモ・テキスト')}<span className="src-sub">{t('iPhoneのメモ、メモ帳アプリ、.txt')}</span></span>
          <span />
          <span className="chev">›</span>
        </li>
        <li className="row-item" onClick={() => onPick('line')}>
          <span className="name"><span className="src-icon line">L</span>LINE<span className="src-sub">{t('トーク履歴（.txt）から、相手ごとに')}</span></span>
          <span />
          <span className="chev">›</span>
        </li>
        <li className="row-item" onClick={() => onPick('chatgpt')}>
          <span className="name"><span className="src-icon gpt">◎</span>ChatGPT<span className="src-sub">{t('データのエクスポート（.zip）から、会話ごとに')}</span></span>
          <span />
          <span className="chev">›</span>
        </li>
        <li className="row-item" onClick={() => onPick('claude')}>
          <span className="name"><span className="src-icon claude">✳</span>Claude<span className="src-sub">{t('データのエクスポート（.zip）から、会話ごとに')}</span></span>
          <span />
          <span className="chev">›</span>
        </li>
      </ul>
      <p className="muted small pad">{t('バックアップ（会話資産の.json）の読み込みは、設定の「バックアップから読み込む」からできます。')}</p>
    </div>
  );
}

function InputStep({ source, raw, fileName, err, onRaw, onNext }: {
  source: Source; raw: string; fileName: string; err: string;
  onRaw: (v: string, name?: string) => void; onNext: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    onRaw(await f.text(), f.name);
    if (fileRef.current) fileRef.current.value = '';
  };
  return (
    <div className="form">
      {source === 'line' ? (
        <details className="howto" open={!raw}>
          <summary>{t('LINEのトーク履歴を保存する方法')}</summary>
          <ol>
            <li>{t('LINEで取り込みたい相手のトークを開く')}</li>
            <li>{t('右上の「≡」→「設定」→「トーク履歴を送信」')}</li>
            <li>{t('「ファイルに保存」を選んで保存する')}</li>
            <li>{t('下の「ファイルを選ぶ」から、保存した.txtを選ぶ')}</li>
          </ol>
          <p className="muted small">{t('相手ごとに1回ずつ取り込みます。グループのトークも取り込めます。')}</p>
        </details>
      ) : (
        <details className="howto">
          <summary>{t('iPhoneのメモをまとめて書き出す方法')}</summary>
          <ol>
            <li>{t('「ショートカット」アプリで新規ショートカットを作る')}</li>
            <li>{t('「メモを検索」を追加（フォルダで絞り込みも可）')}</li>
            <li>{t('「テキストを結合」を追加し、区切りを「カスタム」で === にする')}</li>
            <li>{t('「クリップボードにコピー」を追加して実行する')}</li>
            <li>{t('下の欄に貼り付ける（=== で1件ずつに分かれます）')}</li>
          </ol>
          <p className="muted small">{t('数件だけなら、メモを開いて全文をコピーし、そのまま貼り付けても大丈夫です。')}</p>
        </details>
      )}

      <button className="btn block" onClick={() => fileRef.current?.click()}>{t('ファイルを選ぶ（.txt）')}</button>
      <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {fileName && <p className="muted small pad">{t('選んだファイル: {f}', { f: fileName })}</p>}

      <section className="field">
        <label>{source === 'line' ? t('またはトーク履歴を貼り付け') : t('または貼り付け')}</label>
        <textarea
          className="textarea"
          value={raw}
          onChange={(e) => onRaw(e.target.value)}
          placeholder={source === 'line' ? '[LINE] ○○とのトーク履歴\n2026/11/18(水)\n20:01\t○○\t週末なにしてた？' : t('1件目のメモ\n\n2件目のメモ（空行か === で区切る）')}
        />
      </section>
      {err && <p className="ai-msg error">{err}</p>}
      <button className="btn primary block" disabled={!raw.trim()} onClick={onNext}>{t('読み込んで確認する')}</button>
    </div>
  );
}

function AiInputStep({ service, fileName, count, onLoaded, onNext }: {
  service: 'chatgpt' | 'claude'; fileName: string; count: number | null;
  onLoaded: (c: AiConversation[], name: string) => void; onNext: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [other, setOther] = useState(false);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const buf = await f.arrayBuffer();
      let json: string | null;
      if (isZip(new Uint8Array(buf, 0, Math.min(8, buf.byteLength)))) {
        json = await readZipText(buf, 'conversations.json');
        if (json === null) throw new Error('zipの中に conversations.json が見つかりませんでした');
      } else json = new TextDecoder().decode(buf);
      const r = parseAiExport(json);
      setOther(r.service !== service);
      onLoaded(r.conversations, f.name);
    } catch (e) {
      setErr(t((e as Error).message));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div className="form">
      {service === 'chatgpt' ? (
        <details className="howto" open={count === null}>
          <summary>{t('ChatGPTのデータを書き出す方法')}</summary>
          <ol>
            <li>{t('ChatGPTの「設定」→「データコントロール」→「データをエクスポートする」')}</li>
            <li>{t('届いたメールのリンクから.zipをダウンロードする')}</li>
            <li>{t('下の「ファイルを選ぶ」から、その.zipをそのまま選ぶ')}</li>
          </ol>
        </details>
      ) : (
        <details className="howto" open={count === null}>
          <summary>{t('Claudeのデータを書き出す方法')}</summary>
          <ol>
            <li>{t('claude.aiの「設定」→「プライバシー」→「データをエクスポート」')}</li>
            <li>{t('届いたメールのリンクから.zipをダウンロードする')}</li>
            <li>{t('下の「ファイルを選ぶ」から、その.zipをそのまま選ぶ')}</li>
          </ol>
        </details>
      )}
      <p className="muted small pad">{t('解凍した中の conversations.json を選んでも大丈夫です。ファイルはこの端末の中だけで読み、どこにも送りません。')}</p>
      <button className="btn block" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? t('読み込み中…') : t('ファイルを選ぶ（.zip / .json）')}
      </button>
      <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {fileName && count !== null && <p className="muted small pad">{t('選んだファイル: {f}', { f: fileName })} · {t('会話{n}件', { n: count })}</p>}
      {other && <p className="ai-msg">{t('{s}のデータのようです。このまま取り込めます。', { s: AI_NAME[service === 'chatgpt' ? 'claude' : 'chatgpt'] })}</p>}
      {err && <p className="ai-msg error">{err}</p>}
      <button className="btn primary block" disabled={!count} onClick={onNext}>{t('読み込んで確認する')}</button>
    </div>
  );
}

function PreviewStep({ source, raw, convs, fileName, onDone }: {
  source: Source; raw: string; convs: AiConversation[]; fileName: string;
  onDone: (r: ImportResult, folderId: string | null, n: number) => void;
}) {
  const store = useStore();
  const data = useData();
  const [ai] = useAiSettings();

  // 読み方の設定
  const chat: LineChat | null = useMemo(() => (source === 'line' ? parseLine(raw) : null), [source, raw]);
  const [self, setSelf] = useState(() => (chat ? guessSelf(chat) : ''));
  const [onlyMine, setOnlyMine] = useState(false);
  const [split, setSplit] = useState<TextSplit>(() => guessSplit(raw));
  const [peopleText, setPeopleText] = useState('');
  const people = splitNames(peopleText);

  const [shortReply, setShortReply] = useState(true);
  const ai_ = isAi(source);
  const base = useMemo(
    () => (source === 'reply' ? [parseReplyDraft(raw)].filter((draft) => draft !== null) : ai_
      ? aiToDrafts(convs, { onlyMine, aiName: AI_NAME[source as 'chatgpt' | 'claude'], maxReply: shortReply ? REPLY_MAX : 0 })
      : chat ? lineToDrafts(chat, self, { onlyMine }) : textToDrafts(raw, split, [])),
    [ai_, convs, source, shortReply, chat, self, onlyMine, raw, split],
  );
  // 1件ずつの修正(読み方を変えると作り直す)
  const [edits, setEdits] = useState<Record<string, Partial<ImportDraft>>>({});
  const baseKey = `${self}|${onlyMine}|${split}|${shortReply}`;
  const [editsFor, setEditsFor] = useState(baseKey);
  if (editsFor !== baseKey) { setEditsFor(baseKey); setEdits({}); }
  const drafts = base.map((d) => {
    const e = { ...d, ...edits[d.key] };
    return chat || ai_ ? e : { ...e, people: [...new Set([...e.people, ...people])] };
  });
  const edit = (key: string, patch: Partial<ImportDraft>) => setEdits((x) => ({ ...x, [key]: { ...x[key], ...patch } }));

  const chosen = drafts.filter((d) => d.include && (source !== 'reply' || d.text.trim()));
  const allPeople = [...new Set(chosen.flatMap((d) => d.people))];
  const known = new Set(data.people.map((p) => normalize(p.name)));
  const dates = chosen.map((d) => d.talkedOn).sort();

  // 取り込み先
  const defaultName = ai_ ? AI_NAME[source as 'chatgpt' | 'claude'] : chat ? `LINE ${chat.title || allPeople[0] || ''}`.trim() : `${t('取り込み')} ${formatDate(today())}`;
  const [folderMode, setFolderMode] = useState<'new' | 'existing'>(source === 'reply' ? 'existing' : 'new');
  const [folderName, setFolderName] = useState(defaultName);
  const [folderId, setFolderId] = useState<string>('');
  const choices = folderChoices(foldersOf(data.folders, 'entry'));

  const [backup, setBackup] = useState(source !== 'reply');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [limit, more] = useIncremental(drafts.length);

  const runAi = async () => {
    setAiBusy(true); setMsg('');
    try {
      const knownNames = { people: data.people.map((p) => p.name), topics: data.topics.map((x) => x.name) };
      const targets = chosen.slice(0, AI_MAX);
      for (const d of targets) {
        const s = isDemo(ai) ? await demoSuggest(d.text, knownNames) : await suggestTags(ai.apiKey, d.text, knownNames);
        edit(d.key, { topics: s.topics });
      }
      setMsg(chosen.length > AI_MAX
        ? t('最初の{n}件にタグを付けました', { n: AI_MAX })
        : t('{n}件にタグを付けました', { n: targets.length }));
    } catch (e) {
      setMsg(aiErrorMessage(e));
    } finally {
      setAiBusy(false);
    }
  };

  const run = async () => {
    if (!chosen.length) return;
    setBusy(true); setMsg('');
    try {
      if (backup) {
        // iPhoneでは共有シートが開く。押した直後に呼ぶ必要があるので最初にやる
        const r = await exportBackup(data);
        if (r === 'cancelled') {
          setMsg(t('バックアップを保存しなかったので、取り込みをやめました。チェックを外すとバックアップなしで取り込めます'));
          return;
        }
      }
      const folder = folderMode === 'new'
        ? { newName: folderName.trim() || defaultName, parentId: null }
        : { id: folderId || null };
      const r = await store.importDrafts(chosen.map((d) => ({ ...d, aiTopics: d.topics.length > 0 })), folder);
      onDone(r, folderMode === 'new' ? r.folderIds[0] : folderId || null, chosen.length);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form">
      <div className="import-summary">
        <b>{t('{n}件', { n: chosen.length })}</b>
        <span>
          {dates.length > 0 && (dates[0] === dates[dates.length - 1] ? formatDate(dates[0]) : `${formatDate(dates[0])} 〜 ${formatDate(dates[dates.length - 1])}`)}
          {fileName && ` · ${fileName}`}
        </span>
      </div>

      {source !== 'reply' && <section className="panel">
        <h2>{t('読み方')}</h2>
        {ai_ ? (
          <>
            <label className="toggle">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              <span>{t('自分が話したことだけ残す')}</span>
            </label>
            {!onlyMine && (
              <label className="toggle">
                <input type="checkbox" checked={shortReply} onChange={(e) => setShortReply(e.target.checked)} />
                <span>{t('AIの返事は先頭{n}文字だけ残す', { n: REPLY_MAX })}</span>
              </label>
            )}
            <p className="muted small">{t('会話ごとに1件にし、会話のタイトルをそのまま使います。日付は会話を始めた日です。')}</p>
          </>
        ) : chat ? (
          <>
            <section className="field">
              <label>{t('自分の名前（LINEでの表示名）')}</label>
              <select className="select block" value={self} onChange={(e) => setSelf(e.target.value)}>
                {chat.senders.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </section>
            <label className="toggle">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              <span>{t('自分が話したことだけ残す')}</span>
            </label>
            <p className="muted small">{t('話した日ごとに1件にします。スタンプ・写真は省きます。')}</p>
          </>
        ) : (
          <>
            <section className="field">
              <label>{t('区切り方')}</label>
              <select className="select block" value={split} onChange={(e) => setSplit(e.target.value as TextSplit)}>
                <option value="blank">{t('空行で1件ずつ')}</option>
                <option value="marker">{t('=== や --- の行で1件ずつ')}</option>
                <option value="none">{t('全部で1件')}</option>
              </select>
            </section>
            <section className="field">
              <label>{t('話した相手（全部の話題に付ける・任意）')}</label>
              <input value={peopleText} onChange={(e) => setPeopleText(e.target.value)} placeholder={t('例: さや、もえ')} />
            </section>
            <p className="muted small">{t('先頭の行が日付（2026/11/18 など）なら、その日を「最初に話した日」にします。')}</p>
          </>
        )}
        {allPeople.length > 0 && (
          <div className="chips">
            {allPeople.map((p) => (
              <span key={p} className="chip person small">
                {p}{!known.has(normalize(p)) && <span className="n"> {t('新規')}</span>}
              </span>
            ))}
          </div>
        )}
        {suggestReady(ai) ? (
          <button className="btn small" disabled={aiBusy || !chosen.length} onClick={runAi}>
            {aiBusy ? t('考え中…') : isDemo(ai) ? t('✨ AIでタグを付ける（お試し表示）') : t('✨ AIでタグを付ける')}
          </button>
        ) : (
          <p className="muted small">{t('設定でAI機能をONにすると、タグを自動で付けられます。')}</p>
        )}
      </section>}

      <section className="panel">
        <h2>{t('取り込み先')}</h2>
        <label className="toggle">
          <input type="radio" name="folder" checked={folderMode === 'new'} onChange={() => setFolderMode('new')} />
          <span>{t('新しいフォルダを作る')}</span>
        </label>
        {folderMode === 'new' && (
          <section className="field"><input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={defaultName} /></section>
        )}
        <label className="toggle">
          <input type="radio" name="folder" checked={folderMode === 'existing'} onChange={() => setFolderMode('existing')} />
          <span>{t('今あるフォルダに入れる')}</span>
        </label>
        {folderMode === 'existing' && (
          <select className="select block" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">{t('一番上（フォルダなし）')}</option>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
      </section>

      <div className="section-title">{t('取り込む話題（チェックを外すと除外・タイトルは任意）')}</div>
      <ul className="import-list">
        {drafts.slice(0, limit).map((d) => (
          <li key={d.key} className={`import-item ${d.include ? '' : 'off'}`}>
            <label className="import-check">
              <input type="checkbox" checked={d.include} onChange={(e) => edit(d.key, { include: e.target.checked })} />
            </label>
            <div className="import-body">
              <input
                className="import-title"
                value={d.title}
                placeholder={d.text.split('\n')[0].slice(0, 40)}
                onChange={(e) => edit(d.key, { title: e.target.value })}
              />
              {source === 'reply' ? (
                <>
                  <label className="field">{t('返信文')}
                    <textarea className="textarea" value={d.text} onChange={(e) => edit(d.key, { text: e.target.value })} />
                  </label>
                  <label className="field">{t('相手（読点またはカンマ区切り）')}
                    <input defaultValue={d.people.join('、')} onChange={(e) => edit(d.key, { people: splitNames(e.target.value) })} />
                  </label>
                  <label className="field">{t('タグ（読点またはカンマ区切り）')}
                    <input defaultValue={d.topics.join('、')} onChange={(e) => edit(d.key, { topics: splitNames(e.target.value).map((name) => name.replace(/^#/, '').trim()).filter(Boolean) })} />
                  </label>
                </>
              ) : <p className="import-text">{d.text}</p>}
              <div className="chips">
                <input
                  className="import-date"
                  type="date"
                  value={d.talkedOn}
                  onChange={(e) => e.target.value && edit(d.key, { talkedOn: e.target.value })}
                />
                {d.people.map((p) => <span key={p} className="chip person small">{p}</span>)}
                {d.topics.map((x) => <span key={x} className="chip topic small">#{x}</span>)}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {limit < drafts.length && <LoadMore onVisible={more} rest={drafts.length - limit} />}

      <div className="import-footer">
        <label className="toggle">
          <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
          <span>{t('取り込む前にバックアップを保存')}</span>
        </label>
        {msg && <p className="ai-msg">{msg}</p>}
        <button className="btn primary block" disabled={busy || !chosen.length} onClick={run}>
          {busy ? t('取り込み中…') : t('{n}件を取り込む', { n: chosen.length })}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ r, folderId, n, onAgain }: { r: ImportResult; folderId: string | null; n: number; onAgain: () => void }) {
  const store = useStore();
  const [undone, setUndone] = useState(false);
  if (undone) {
    return (
      <div className="form">
        <p className="notice">{t('取り込みを取り消しました')}</p>
        <button className="btn block" onClick={onAgain}>{t('ほかのデータを取り込む')}</button>
      </div>
    );
  }
  return (
    <div className="form">
      <p className="notice">{t('{n}件を取り込みました', { n })}</p>
      {r.personIds.length > 0 && <p className="muted small">{t('新しく追加した人: {n}人', { n: r.personIds.length })}</p>}
      <button className="btn primary block" onClick={() => go(folderHref('entry', folderId))}>{t('取り込んだ話題を見る')}</button>
      <button className="btn block" onClick={onAgain}>{t('ほかのデータを取り込む')}</button>
      <button className="btn danger block" onClick={async () => { await store.undoImport(r); setUndone(true); }}>{t('この取り込みを取り消す')}</button>
    </div>
  );
}
