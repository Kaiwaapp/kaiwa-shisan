import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { Store } from '../core/store';

export const StoreContext = createContext<Store>(null!);
export const useStore = () => useContext(StoreContext);

export function useData() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.snapshot);
}

export function useLoaded() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.loaded);
}

export function useLoadFailed() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.loadFailed);
}

/** 端末に覚えておく表示設定(並べ替えなど) */
export function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const k = 'kaiwa-shisan:pref:' + key;
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(k) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try { localStorage.setItem(k, nv); } catch { /* noop */ }
  };
  return [v, set];
}

// ---- ハッシュルーティング(戻るジェスチャーが効くように) ----
export interface Route {
  path: string[];
  query: URLSearchParams;
}

const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
};

let navDepth = 0;

// 画面ごとのスクロール位置。新しく開いた画面は一番上から、戻った画面は元の位置から表示する
const scrollPos = new Map<string, number>();
let toTop = false;
if (typeof window !== 'undefined') {
  try { history.scrollRestoration = 'manual'; } catch { /* 古いブラウザ */ }
  addEventListener('scroll', () => { scrollPos.set(location.hash, scrollY); }, { passive: true });
  addEventListener('hashchange', () => {
    const y = toTop ? 0 : scrollPos.get(location.hash) ?? 0;
    toTop = false;
    // 新しい画面が描かれてから動かす
    requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(0, y)));
  });
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (to: string) => {
  navDepth++;
  toTop = true;
  location.hash = to;
};

/** アプリ内で来た画面なら履歴を戻る。直接開いた場合は fallback へ */
export const back = (fallback = '/') => {
  if (navDepth > 0) {
    navDepth--;
    history.back();
  } else {
    location.replace('#' + fallback);
  }
};

export const switchTab = (key: string) => {
  navDepth = 0;
  toTop = true;
  location.replace('#/' + key);
};

export const formatDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const now = new Date();
  return y === now.getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
};
