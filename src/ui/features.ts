// 設定 > 使う機能 のオンオフ。オフにしても画面に出さないだけで、データは消さない。
// 端末ごとの表示設定なので localStorage に置く(バックアップには含めない)。
import { useSyncExternalStore } from 'react';

export interface Features {
  /** フォルダ(オフなら一覧はフォルダなしで全件を並べる) */
  folders: boolean;
  /** お気に入り(☆) */
  favorites: boolean;
  /** 人のグループ */
  groups: boolean;
  /** 記録の相手・話題の下に出す直近の候補 */
  recent: boolean;
  /** 記録のタイトル欄 */
  title: boolean;
  /** 一覧・編集画面のコピーボタン */
  copy: boolean;
  /** 設定の「他のアプリから取り込む」 */
  import: boolean;
}

export const FEATURE_KEYS = ['folders', 'favorites', 'groups', 'recent', 'title', 'copy', 'import'] as const;

/** 設定画面に出す名前と説明(表示時に t() を通す) */
export const FEATURE_LABELS: Record<keyof Features, { label: string; note: string }> = {
  folders: { label: 'フォルダ', note: 'オフにすると、記録・人・話題をフォルダに分けずに全部並べます' },
  favorites: { label: 'お気に入り', note: '☆ボタンと★のお気に入り一覧' },
  groups: { label: 'グループ', note: '人のグループと、記録の相手を「グループから」選ぶ機能' },
  recent: { label: '直近の候補', note: '記録の相手・話題の入力欄の下に出す最近の候補' },
  title: { label: '記録のタイトル', note: '記録の編集画面のタイトル欄' },
  copy: { label: 'コピーボタン', note: '一覧と編集画面の本文コピーボタン' },
  import: { label: '他のアプリから取り込む', note: '設定の取り込みの項目' },
};

const KEY = 'kaiwa-shisan:features';
const DEFAULTS: Features = { folders: true, favorites: true, groups: true, recent: true, title: true, copy: true, import: true };

const load = (): Features => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
};

let current = load();
const listeners = new Set<() => void>();

export const getFeatures = () => current;

export function setFeature(key: keyof Features, on: boolean) {
  current = { ...current, [key]: on };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 保存できない環境では今回だけ反映 */ }
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => { listeners.delete(f); };
};

export const useFeatures = () => useSyncExternalStore(subscribe, getFeatures);
