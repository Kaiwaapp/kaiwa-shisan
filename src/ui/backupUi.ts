import { toBackup } from '../core/backup';
import { today, type AppData } from '../core/types';
import { t } from '../i18n';

const KEY = 'kaiwa-shisan:lastBackupAt';

export const getLastBackup = (): number | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};

const markBackup = () => {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* noop */ }
};

/** iPhoneでは共有シート(「ファイルに保存」など)、それ以外はダウンロード */
export async function exportBackup(data: AppData): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify(toBackup(data), null, 2);
  const name = `kaiwa-shisan-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('会話資産のバックアップ') });
      markBackup();
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
  markBackup();
  return 'downloaded';
}

export const needsBackupReminder = (data: AppData) => {
  if (data.entries.length < 5) return false;
  const last = getLastBackup();
  return !last || Date.now() - last > 14 * 24 * 3600 * 1000;
};
