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
  /** 記録のメモ欄(本文とは別の覚え書き) */
  memo: boolean;
  /** 一覧・編集画面のコピーボタン */
  copy: boolean;
  /** 記録への画像の添付 */
  images: boolean;
  /** 設定の「他のアプリから取り込む」 */
  import: boolean;
  /** 人のプロフィール(年齢・仕事・趣味など) */
  profile: boolean;
  /** 記録の編集画面で、保存せずに戻るときの確認 */
  confirmDiscard: boolean;
  /** 人: 名前に入力した文字(変換前のかな)から読み仮名を作る。設定画面の「人」の欄に出す */
  readingPerson: boolean;
  /** 話題: 名前に入力した文字から読み仮名を作る。設定画面の「話題」の欄に出す */
  readingTopic: boolean;
}

export const FEATURE_KEYS = ['folders', 'favorites', 'groups', 'recent', 'title', 'memo', 'copy', 'images', 'import', 'profile', 'confirmDiscard'] as const;

/** 使う機能の一覧には出さず、設定画面のカテゴリ(人・話題)の欄に出すもの */
export type CategoryKey = 'readingPerson' | 'readingTopic';

/** 設定画面に出す名前と説明(表示時に t() を通す) */
export const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], { label: string; note: string }> = {
  folders: { label: 'フォルダ', note: 'オフにすると、記録・人・話題をフォルダに分けずに全部並べます' },
  favorites: { label: 'お気に入り', note: '☆ボタンと★のお気に入り一覧' },
  groups: { label: 'グループ', note: '人のグループと、記録の相手を「グループから」選ぶ機能' },
  recent: { label: '直近の候補', note: '記録の相手・話題の入力欄の下に、入力しなくても候補を出す' },
  title: { label: '記録のタイトル', note: '記録の編集画面のタイトル欄' },
  memo: { label: '記録のメモ', note: '記録の本文とは別に、相手の反応などを書いておく欄' },
  copy: { label: 'コピーボタン', note: '一覧と編集画面の本文コピーボタン' },
  images: { label: '画像の添付', note: '記録に写真やスクショを添付する機能' },
  import: { label: '他のアプリから取り込む', note: '設定の取り込みの項目' },
  profile: { label: '人のプロフィール', note: '人の画面の年齢・仕事・趣味などの欄' },
  confirmDiscard: { label: '保存せずに戻るときの確認', note: '記録を入力したままキャンセルしたとき、保存されないことを確認する' },
};

const KEY = 'kaiwa-shisan:features';
const DEFAULTS: Features = { folders: true, favorites: true, groups: true, recent: true, title: true, memo: true, copy: true, images: true, import: true, profile: true, confirmDiscard: true, readingPerson: true, readingTopic: true };

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
