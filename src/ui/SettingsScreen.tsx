import { useEffect, useRef, useState } from 'react';
import { parseBackup } from '../core/backup';
import type { AppData } from '../core/types';
import { useData, useStore } from './hooks';
import { Header } from './components';
import { exportBackup, getLastBackup } from './backupUi';
import { AiSettingsPanel } from './AiTools';

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
      setMsg('バックアップを書き出しました');
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
      setMsg('');
    } catch (e) {
      setMsg((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const apply = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace' && !confirm('今のデータをすべて消して、バックアップの内容に置き換えます。よろしいですか？')) return;
    await store.importData(pending, mode);
    setPending(null);
    setMsg(mode === 'merge' ? 'バックアップを統合しました' : 'バックアップで置き換えました');
  };

  return (
    <div className="screen">
      <Header title="設定" />
      <div className="form">
        <div className="stats">
          <div><b>{data.entries.length}</b><span>記録</span></div>
          <div><b>{data.people.length}</b><span>人</span></div>
          <div><b>{data.topics.length}</b><span>話題</span></div>
          <div><b>{data.folders.length}</b><span>フォルダ</span></div>
        </div>

        <section className="panel">
          <h2>バックアップ</h2>
          <p className="muted">
            データはこの端末の中だけに保存されています。iPhoneでは長く開かないと消えることがあるので、ときどき書き出して「ファイル」アプリやiCloud Driveに保存してください。
          </p>
          <p className="muted small">
            最終バックアップ: {last ? new Date(last).toLocaleString('ja-JP') : 'まだありません'}
          </p>
          <button className="btn primary block" onClick={onExport}>バックアップを書き出す</button>
          <button className="btn block" onClick={() => fileRef.current?.click()}>バックアップから読み込む</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {pending && (
            <div className="confirm">
              <p>
                読み込むファイル: 記録{pending.entries.length}件・人{pending.people.length}人・話題{pending.topics.length}件・フォルダ{pending.folders.length}個
              </p>
              <button className="btn primary block" onClick={() => apply('merge')}>今のデータに統合する</button>
              <button className="btn danger block" onClick={() => apply('replace')}>今のデータを置き換える</button>
              <button className="btn ghost block" onClick={() => setPending(null)}>やめる</button>
            </div>
          )}
          {msg && <p className="notice">{msg}</p>}
        </section>

        <AiSettingsPanel />

        <section className="panel">
          <h2>保存の状態</h2>
          <p className="muted small">
            ホーム画面から起動: {standalone ? 'はい' : 'いいえ'}
            <br />
            データの永続化: {persisted === null ? '不明' : persisted ? '有効' : '未許可'}
          </p>
          {!standalone && (
            <p className="muted small">
              iPhoneのSafariで共有ボタン →「ホーム画面に追加」すると、アプリのように使えてデータも消えにくくなります。
            </p>
          )}
        </section>

        <p className="muted small center">会話資産 試作版 v0.9</p>
      </div>
    </div>
  );
}
