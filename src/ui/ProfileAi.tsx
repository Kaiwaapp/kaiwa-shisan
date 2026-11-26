// プロフィールのAI自動入力(試作)。プロフィールの編集を開いたときだけ読み込む。
import { useRef, useState, type ClipboardEvent } from 'react';
import { autoFocusRef } from './focus';
import { aiErrorMessage, isDemo } from '../core/ai';
import { demoFillProfile, fillProfile, type FieldSpec, type ProfileSource } from '../core/aiProfile';
import type { Person, PersonProfile } from '../core/types';
import { useAiSettings, yenText } from './AiTools';
import { t } from '../i18n';

interface Row { key: string; label: string; value: string; before: string; on: boolean }

export default function ProfileAi({ person, texts, fields, current, onApply }: {
  person: Person;
  /** この人の話題の本文(新しい順) */
  texts: string[];
  fields: FieldSpec[];
  current: PersonProfile;
  onApply: (p: PersonProfile) => void;
}) {
  const [s] = useAiSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'' | 'paste'>('');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);

  const run = async (src: ProfileSource) => {
    setBusy(true); setErr(''); setInfo(''); setRows(null);
    try {
      const r = isDemo(s) ? await demoFillProfile(src, fields) : await fillProfile(s.apiKey, src, fields);
      const out: Row[] = [];
      for (const f of fields) {
        const v = r.profile.fields?.[f.id];
        const before = current.fields?.[f.id]?.trim() ?? '';
        if (v && v !== before) out.push({ key: f.id, label: f.label, value: v, before, on: !before });
      }
      for (const x of r.profile.extra ?? []) {
        const before = current.extra?.find((y) => y.label === x.label)?.value ?? '';
        if (x.value !== before) out.push({ key: 'x:' + x.label, label: x.label, value: x.value, before, on: !before });
      }
      setRows(out);
      const demo = isDemo(s) ? t('お試し表示です(APIキー未設定のため簡易的な読み取り)。') : t('読み取りました({v})。', { v: yenText(r.yen) });
      setInfo(out.length ? demo + t('入れる項目を選んでください') : demo + t('新しく入れられる項目は見つかりませんでした'));
      setMode('');
    } catch (e) {
      setErr(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const fromRecords = () => {
    if (!texts.length && !person.memo.trim()) { setErr(t('まだ{name}の話題がありません', { name: person.name })); return; }
    run({ kind: 'records', name: person.name, memo: person.memo, texts });
  };

  const onPaste = (e: ClipboardEvent) => {
    const f = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile();
    if (!f) return;
    e.preventDefault();
    run({ kind: 'image', image: f });
  };

  const apply = () => {
    if (!rows) return;
    const p: PersonProfile = { fields: {}, extra: [] };
    for (const r of rows) {
      if (!r.on) continue;
      if (r.key.startsWith('x:')) p.extra!.push({ label: r.label, value: r.value });
      else p.fields![r.key] = r.value;
    }
    onApply(p);
    setRows(null);
    setInfo(t('入れました。保存すると残ります'));
  };

  const picked = rows?.filter((r) => r.on).length ?? 0;

  return (
    <div className="ai-tools profile-ai">
      <div className="ai-sug-head"><span className="muted small">{t('✨ AIで自動入力')}</span></div>
      <div className="ai-bar">
        <button className="btn small" disabled={busy} onClick={fromRecords}>{t('話題から')}</button>
        <button className="btn small" disabled={busy} onClick={() => setMode(mode === 'paste' ? '' : 'paste')}>{t('文章を貼り付け')}</button>
        <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>{t('📷 スクショ')}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) run({ kind: 'image', image: f }); e.target.value = ''; }} />
      </div>
      {mode === 'paste' && (
        <div className="profile-paste">
          <textarea className="textarea" rows={4} ref={autoFocusRef} value={pasted} onChange={(e) => setPasted(e.target.value)} onPaste={onPaste}
            placeholder={t('マッチングアプリやSNSのプロフィールをコピーして貼り付け（画像の貼り付けもできます）')} />
          <button className="btn small primary" disabled={busy || !pasted.trim()} onClick={() => run({ kind: 'text', text: pasted })}>{t('読み取る')}</button>
        </div>
      )}
      {busy && <p className="ai-msg">{t('読み取り中…')}</p>}
      {(err || info) && <p className={err ? 'ai-msg error' : 'ai-msg'}>{err || info}</p>}
      {rows && rows.length > 0 && (
        <div className="ai-rows">
          {rows.map((r, i) => (
            <label key={r.key} className="toggle ai-row">
              <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              <span>
                <b>{r.label}</b> {r.value}
                {r.before && <span className="muted small block-note">{t('今: {v}', { v: r.before })}</span>}
              </span>
            </label>
          ))}
          <div className="ai-bar">
            <button className="btn small primary" disabled={!picked} onClick={apply}>{t('選んだ{n}項目を入れる', { n: picked })}</button>
            <button className="link small muted" onClick={() => { setRows(null); setInfo(''); }}>{t('閉じる')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
