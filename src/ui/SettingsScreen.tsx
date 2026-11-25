import { useEffect, useMemo, useRef, useState } from 'react';
import { diffSince, readBackup, type BackupKind, type ParsedBackup } from '../core/backup';
import { go, useData, useStore } from './hooks';
import { Header } from './components';
import { exportBackup, getLastBackup, getManifest } from './backupUi';
import { AiSettingsPanel } from './AiTools';
import { FEATURE_KEYS, FEATURE_LABELS, setFeature, useFeatures } from './features';
import { LANGS, langPref, locale, setLangPref, t, type LangPref } from '../i18n';

export function SettingsScreen() {
  const data = useData();
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [msg, setMsg] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [last, setLast] = useState(getLastBackup());
  // 前回の書き出しからの変更数(増分で書き出す件数)
  const [manifest, setManifest] = useState(getManifest());
  const changes = useMemo(() => diffSince(data, manifest).count, [data, manifest]);
  const feat = useFeatures();

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

  const onExport = async (kind: BackupKind) => {
    const r = await exportBackup(data, kind);
    if (r !== 'cancelled') {
      setLast(getLastBackup());
      setManifest(getManifest());
      setMsg(kind === 'incremental' ? t('変更分を書き出しました') : t('バックアップを書き出しました'));
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(readBackup(await f.text()));
      setMsg('');
    } catch (e) {
      setMsg(t((e as Error).message));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const apply = async (mode: 'merge' | 'replace' | 'incremental') => {
    if (!pending) return;
    if (mode === 'replace' && !confirm(t('今のデータをすべて消して、バックアップの内容に置き換えます。よろしいですか？'))) return;
    if (mode === 'incremental') await store.importIncremental(pending);
    else await store.importData(pending.data, mode);
    setPending(null);
    setMsg(mode === 'merge' ? t('バックアップを統合しました') : mode === 'replace' ? t('バックアップで置き換えました') : t('変更分を反映しました'));
  };
  const deletedCount = pending ? Object.values(pending.deleted).reduce((n, l) => n + l.length, 0) : 0;

  return (
    <div className="screen">
      <Header title={t('設定')} />
      <div className="form">
        <div className="stats">
          <div><b>{data.entries.length}</b><span>{t('記録')}</span></div>
          <div><b>{data.people.length}</b><span>{t('人')}</span></div>
          <div><b>{data.topics.length}</b><span>{t('話題')}</span></div>
          <div><b>{data.folders.length}</b><span>{t('フォルダ')}</span></div>
        </div>

        <section className="panel">
          <h2>{t('言語')} / Language</h2>
          <select className="select block" value={langPref()} onChange={(e) => setLangPref(e.target.value as LangPref)}>
            <option value="auto">{t('自動（端末の言語）')}</option>
            {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </section>

        <section className="panel">
          <h2>{t('使う機能')}</h2>
          <p className="muted small">{t('使わない機能はオフにすると画面に出なくなります。オフにしてもデータは消えず、オンに戻せば元どおり出ます。')}</p>
          <div className="feature-toggles">
            {FEATURE_KEYS.map((k) => (
              <label key={k} className="toggle feature">
                <input type="checkbox" checked={feat[k]} onChange={(e) => setFeature(k, e.target.checked)} />
                <span>
                  {t(FEATURE_LABELS[k].label)}
                  <span className="muted small block-note">{t(FEATURE_LABELS[k].note)}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="muted small">{t('AI機能のオンオフは下の「AI機能（試作）」にあります。')}</p>
        </section>

        {feat.import && <section className="panel">
          <h2>{t('他のアプリから取り込む')}</h2>
          <p className="muted small">{t('iPhoneのメモ・テキストやLINEのトーク履歴を、記録としてまとめて取り込めます。')}</p>
          <button className="btn block" onClick={() => go('/import')}>{t('取り込みを始める')}</button>
        </section>}

        <section className="panel">
          <h2>{t('バックアップ')}</h2>
          <p className="muted">
            {t('データはこの端末の中だけに保存されています。iPhoneでは長く開かないと消えることがあるので、ときどき書き出して「ファイル」アプリやiCloud Driveに保存してください。')}
          </p>
          <p className="muted small">
            {t('最終バックアップ: {d}', { d: last ? new Date(last).toLocaleString(locale()) : t('まだありません') })}
          </p>
          <button className="btn primary block" onClick={() => onExport('full')}>{t('すべて書き出す（一括）')}</button>
          <button className="btn block" disabled={!!manifest && changes === 0} onClick={() => onExport('incremental')}>
            {t('変更分だけ書き出す（増分）')}
          </button>
          <p className="muted small">
            {manifest
              ? changes
                ? t('前回の書き出しから{n}件の追加・変更・削除があります。増分は前回の書き出し以降の変更だけを小さいファイルにします。', { n: changes })
                : t('前回の書き出しから変更はありません。')
              : t('まだ書き出したことがないので、増分でも全部を書き出します。')}
          </p>
          <button className="btn block" onClick={() => fileRef.current?.click()}>{t('バックアップから読み込む')}</button>
          <p className="muted small">{t('一括のファイルも増分のファイルも読み込めます。増分は、一括のあとに書き出した順に読み込むと元に戻せます。')}</p>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {pending && pending.kind === 'incremental' && (
            <div className="confirm">
              <p>
                {t('増分のファイル（{d}時点）: 追加・変更 記録{e}件・人{p}人・話題{t}件・フォルダ{f}個、削除{x}件', {
                  d: new Date(pending.exportedAt).toLocaleString(locale()),
                  e: pending.data.entries.length, p: pending.data.people.length, t: pending.data.topics.length, f: pending.data.folders.length, x: deletedCount,
                })}
              </p>
              <button className="btn primary block" onClick={() => apply('incremental')}>{t('今のデータに反映する')}</button>
              <button className="btn ghost block" onClick={() => setPending(null)}>{t('やめる')}</button>
            </div>
          )}
          {pending && pending.kind === 'full' && (
            <div className="confirm">
              <p>
                {t('読み込むファイル: 記録{e}件・人{p}人・話題{t}件・フォルダ{f}個', { e: pending.data.entries.length, p: pending.data.people.length, t: pending.data.topics.length, f: pending.data.folders.length })}
              </p>
              <button className="btn primary block" onClick={() => apply('merge')}>{t('今のデータに統合する')}</button>
              <button className="btn danger block" onClick={() => apply('replace')}>{t('今のデータを置き換える')}</button>
              <button className="btn ghost block" onClick={() => setPending(null)}>{t('やめる')}</button>
            </div>
          )}
          {msg && <p className="notice">{msg}</p>}
        </section>

        <AiSettingsPanel />

        <section className="panel">
          <h2>{t('保存の状態')}</h2>
          <p className="muted small">
            {t('ホーム画面から起動: {v}', { v: standalone ? t('はい') : t('いいえ') })}
            <br />
            {t('データの永続化: {v}', { v: persisted === null ? t('不明') : persisted ? t('有効') : t('未許可') })}
          </p>
          {!standalone && (
            <p className="muted small">
              {t('iPhoneのSafariで共有ボタン →「ホーム画面に追加」すると、アプリのように使えてデータも消えにくくなります。')}
            </p>
          )}
        </section>

        <p className="muted small center">{t('会話資産 試作版')} v0.12</p>
      </div>
    </div>
  );
}
