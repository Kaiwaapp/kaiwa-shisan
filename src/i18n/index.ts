import { useSyncExternalStore } from 'react';
import en from './en';

/**
 * 多言語対応。日本語の文言そのものをキーにして、各言語の辞書で置き換える(gettext方式)。
 * 言語を足すときは en.ts をコピーして訳を書き、下の DICTS と LANGS に1行ずつ足すだけ。
 */
export type Lang = 'ja' | 'en';
export type LangPref = Lang | 'auto';

const DICTS: Record<Lang, Record<string, string>> = { ja: {}, en };
export const LANGS: { key: Lang; label: string }[] = [
  { key: 'ja', label: '日本語' },
  { key: 'en', label: 'English' },
];

const KEY = 'kaiwa-shisan:lang';
const detect = (): Lang => {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of langs) {
    const base = l.toLowerCase().split('-')[0] as Lang;
    if (base in DICTS) return base;
  }
  return 'en';
};
const readPref = (): LangPref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'ja' || v === 'en' ? v : 'auto';
  } catch {
    return 'auto';
  }
};

let pref: LangPref = readPref();
let lang: Lang = pref === 'auto' ? detect() : pref;
const listeners = new Set<() => void>();
const apply = () => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = t('会話資産');
  }
};

export const currentLang = () => lang;

/** 遅延読み込みする画面が、自分の文言の辞書を足す */
export function addDict(l: Lang, dict: Record<string, string>) {
  Object.assign(DICTS[l], dict);
}
export const langPref = () => pref;
export function setLangPref(p: LangPref) {
  pref = p;
  lang = p === 'auto' ? detect() : p;
  try { localStorage.setItem(KEY, p); } catch { /* noop */ }
  apply();
  listeners.forEach((l) => l());
}
export const useLang = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => lang);

/** 文言を今の言語にする。{name} は vars で置き換える */
export function t(src: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][src] ?? src;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** 日付・時刻の表示用ロケール */
export const locale = () => (lang === 'ja' ? 'ja-JP' : 'en-US');

apply();
