import { useSyncExternalStore } from 'react';

// 画面の色: 端末に合わせる／ライト／ダーク。<html data-theme> で切り替え、未設定なら端末の設定に従う
export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'kaiwa-shisan:theme';
const listeners = new Set<() => void>();
const dark = matchMedia('(prefers-color-scheme: dark)');

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* noop */ }
  return 'auto';
}
let pref: ThemePref = read();

function apply() {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;
  // iPhoneの上部バーなどの色も合わせる
  const isDark = pref === 'dark' || (pref === 'auto' && dark.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#171614' : '#f7f5f0');
}

export function installTheme() {
  apply();
  dark.addEventListener?.('change', apply);
}
export const themePref = () => pref;
export function setThemePref(p: ThemePref) {
  pref = p;
  try { localStorage.setItem(KEY, p); } catch { /* noop */ }
  apply();
  listeners.forEach((l) => l());
}
export const useThemePref = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => pref);
