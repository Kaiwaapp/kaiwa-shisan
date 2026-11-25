import { makeManifest, toBackup, toIncremental, type BackupKind, type ExportManifest } from '../core/backup';
import { type AppData, type EntryImage } from '../core/types';
import { t } from '../i18n';

const KEY = 'kaiwa-shisan:lastBackupAt';
/** 前回書き出したときの中身の控え(増分エクスポートで差分を取るため) */
const MANIFEST_KEY = 'kaiwa-shisan:exportManifest';

export const getLastBackup = (): number | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};

export const getManifest = (): ExportManifest | null => {
  try {
    const v = localStorage.getItem(MANIFEST_KEY);
    const m = v ? (JSON.parse(v) as ExportManifest) : null;
    return m && typeof m.at === 'number' && m.items ? m : null;
  } catch {
    return null;
  }
};

const markBackup = (data: AppData) => {
  const now = Date.now();
  try { localStorage.setItem(KEY, String(now)); } catch { /* noop */ }
  try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(makeManifest(data, now))); } catch { /* noop */ }
};

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/**
 * 一括(full)または増分(incremental)で書き出す。
 * iPhoneでは共有シート(「ファイルに保存」など)、それ以外はダウンロード
 */
export async function exportBackup(data: AppData, kind: BackupKind = 'full', images?: EntryImage[]): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const body = kind === 'incremental' ? toIncremental(data, getManifest(), images) : toBackup(data, images);
  // 画像入りは大きくなるので、整形(改行・字下げ)なしで書き出す
  const json = body.images?.length ? JSON.stringify(body) : JSON.stringify(body, null, 2);
  const name = kind === 'incremental' ? `kaiwa-shisan-diff-${stamp()}.json` : `kaiwa-shisan-${stamp()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('会話資産のバックアップ') });
      markBackup(data);
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // 共有に失敗したらダウンロードにフォールバック
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  markBackup(data);
  return 'downloaded';
}
