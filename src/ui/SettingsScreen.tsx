import { useEffect, useRef, useState } from 'react';
import { parseBackup } from '../core/backup';
import type { AppData } from '../core/types';
import { useData, useStore } from './hooks';
import { Header } from './components';
import { exportBackup, getLastBackup } from './backupUi';
import { AiSettingsPanel } from './AiTools';
import { LANGS, langPref, locale, setLangPref, t, type LangPref } from '../i18n';

export function SettingsScreen() {
  const data = useData();
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const [msg, setMsg] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [last, setLast] = useState(getLastBackup());

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

  const onExport = async () => {
    const r = await exportBackup(data);
    if (r !== 'cancelled') {
      setLast(getLastBackup());
      setMsg(t('バックアップを書き出しました'));
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
      setMsg('');
    } catch (e) {
      setMsg(t((e as Error).message));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const apply = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace' && !confirm(t('今のデータをすべて消して、バックアップの内容に置き換えます。よろしいですか？'))) return;
    await store.importData(pending, mode);
    setPending(null);
    setMsg(mode === 'merge' ? t('バックアップを統合しました') : t('バックアップで置き換えました'));
  };

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
          <h2>{t('バックアップ')}</h2>
          <p className="muted">
            {t('データはこの端末の中だけに保存されています。iPhoneでは長く開かないと消えることがあるので、ときどき書き出して「ファイル」アプリやiCloud Driveに保存してください。')}
          </p>
          <p className="muted small">
            {t('最終バックアップ: {d}', { d: last ? new Date(last).toLocaleString(locale()) : t('まだありません') })}
          </p>
          <button className="btn primary block" onClick={onExport}>{t('バックアップを書き出す')}</button>
          <button className="btn block" onClick={() => fileRef.current?.click()}>{t('バックアップから読み込む')}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {pending && (
            <div className="confirm">
              <p>
                {t('読み込むファイル: 記録{e}件・人{p}人・話題{t}件・フォルダ{f}個', { e: pending.entries.length, p: pending.people.length, t: pending.topics.length, f: pending.folders.length })}
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
