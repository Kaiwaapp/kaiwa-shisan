// 設定 > 機能とカスタマイズ のオンオフ。オフにしても画面に出さないだけで、データは消さない。
// 端末ごとの表示設定なので localStorage に置く(バックアップには含めない)。
import { useSyncExternalStore } from 'react';

export interface Features {
  /** フォルダ(オフなら一覧はフォルダなしで全件を並べる) */
  folders: boolean;
  /** お気に入り(☆) */
  favorites: boolean;
  /** 人のグループ */
  groups: boolean;
  /** 話題の相手・タグの下に出す直近の候補 */
  recent: boolean;
  /** 話題のタイトル欄 */
  title: boolean;
  /** 話題のメモ欄(本文とは別の覚え書き) */
  memo: boolean;
  /** 一覧・編集画面のコピーボタン */
  copy: boolean;
  /** 話題への画像の添付 */
  images: boolean;
  /** 設定の「他のアプリから取り込む」 */
  import: boolean;
  /** 人のプロフィール(年齢・仕事・趣味など) */
  profile: boolean;
  /** 人の関係(友達・家族など)と、人タブの関係での絞り込み */
  relations: boolean;
  /** 話題の編集画面で、保存せずに戻るときの確認 */
  confirmDiscard: boolean;
  /** 人: 名前に入力した文字(変換前のかな)から読み仮名を作る。設定画面の「人」の欄に出す */
  readingPerson: boolean;
  /** タグ: 名前に入力した文字から読み仮名を作る。設定画面の「タグ」の欄に出す */
  readingTopic: boolean;
  /** タグ: タグタブに「おすすめのタグから登録」の案内を出す(案内の「今後表示しない」でオフになる) */
  presetHint: boolean;
  /** 予定(予定タブと人ごとの予定) */
  schedule: boolean;
  /** 話題タブの一番上に今日・明日の予定を出す */
  scheduleToday: boolean;
  /** 有料機能(将来は月額課金): バナー広告を出さない。今は誰でも切り替えられる。設定画面の「有料機能」の欄に出す */
  noAds: boolean;
}

export const FEATURE_KEYS = ['folders', 'favorites', 'groups', 'recent', 'title', 'memo', 'copy', 'images', 'import', 'profile', 'relations', 'confirmDiscard', 'presetHint', 'schedule', 'scheduleToday'] as const;

/** 設定 > 機能とカスタマイズ の並び。機能のグループごとに折りたためる。新しい設定は当てはまるグループに足す */
export const FEATURE_GROUPS: { key: string; title: string; items: (keyof Features)[] }[] = [
  { key: 'entry', title: '話題', items: ['title', 'memo', 'images', 'copy', 'recent', 'confirmDiscard'] },
  { key: 'person', title: '人', items: ['readingPerson', 'relations', 'groups', 'profile'] },
  { key: 'topic', title: 'タグ', items: ['readingTopic', 'presetHint'] },
  { key: 'schedule', title: '予定', items: ['schedule', 'scheduleToday'] },
  { key: 'common', title: '全体', items: ['folders', 'favorites', 'import'] },
];

/** 設定画面に出す名前と説明(表示時に t() を通す) */
export const FEATURE_LABELS: Record<keyof Features, { label: string; note: string }> = {
  folders: { label: 'フォルダ', note: 'オフにすると、話題・人・タグをフォルダに分けずに全部並べます' },
  favorites: { label: 'お気に入り', note: '☆ボタンと★のお気に入り一覧' },
  groups: { label: 'グループ', note: '人のグループと、話題の相手を「グループから」選ぶ機能' },
  recent: { label: '直近の候補', note: '話題の相手・タグの入力欄の下に、入力しなくても候補を出す' },
  title: { label: '話題のタイトル', note: '話題の編集画面のタイトル欄' },
  memo: { label: '話題のメモ', note: '話題の本文とは別に、相手の反応などを書いておく欄' },
  copy: { label: 'コピーボタン', note: '一覧と編集画面の本文コピーボタン' },
  images: { label: '画像の添付', note: '話題に写真やスクショを添付する機能' },
  import: { label: '他のアプリから取り込む', note: '設定の取り込みの項目' },
  relations: { label: '関係', note: '人に友達・家族などの関係を付けて、人タブで絞り込む' },
  profile: { label: '人のプロフィール', note: '人の画面の年齢・仕事・趣味などの欄' },
  readingPerson: { label: '人の名前に入力した文字から読み仮名を作る', note: '日本語で入力したときの変換前のかなを、新しく作るときの読み仮名に入れます（検索用）。' },
  readingTopic: { label: 'タグに入力した文字から読み仮名を作る', note: '日本語で入力したときの変換前のかなを、新しく作るときの読み仮名に入れます（検索用）。' },
  presetHint: { label: 'おすすめのタグの案内', note: 'タグタブに、用意したタグリストから登録する案内を出す' },
  schedule: { label: '予定', note: '予定タブと、人の画面の予定欄。予定に人を紐づけて、カレンダーやリストで見られます' },
  scheduleToday: { label: '今日・明日の予定を表示', note: 'アプリを開いたとき、話題タブの一番上に今日と明日の予定を出す' },
  noAds: { label: 'バナー広告を表示しない', note: '画面下のバナー広告を消します。' },
  confirmDiscard: { label: '保存せずに戻るときの確認', note: '話題を入力したままキャンセルしたとき、保存されないことを確認する' },
};

const KEY = 'kaiwa-shisan:features';
const DEFAULTS: Features = { folders: true, favorites: true, groups: true, recent: true, title: true, memo: true, copy: true, images: true, import: true, profile: true, relations: true, confirmDiscard: true, readingPerson: false, readingTopic: false, presetHint: true, schedule: true, scheduleToday: true, noAds: false };

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
