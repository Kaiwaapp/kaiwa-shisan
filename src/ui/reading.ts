import { useEffect, useState, useSyncExternalStore } from 'react';
import { isKanaOnly, ReadingDict, toHiragana } from '../core/reading';
import { currentLang } from '../i18n';

/** この端末で入力中に覚えた「確定した文字 → 読み」(画面を閉じると忘れる) */
export const readingDict = new ReadingDict();
let version = 0;
const listeners = new Set<() => void>();

/**
 * 日本語入力の変換を見張る。変換前のかなと確定した文字を組にして覚える。
 * どの入力欄でも動くので、記録の画面で新しく入れた人・話題の名前の読みも拾える
 */
export function installReadingCapture() {
  let lastKana = '';
  document.addEventListener('compositionstart', () => { lastKana = ''; }, true);
  document.addEventListener('compositionupdate', (e) => {
    const d = (e as CompositionEvent).data ?? '';
    if (isKanaOnly(d)) lastKana = d;
  }, true);
  document.addEventListener('compositionend', (e) => {
    const d = (e as CompositionEvent).data ?? '';
    if (d && lastKana && !isKanaOnly(d)) {
      readingDict.add(d, toHiragana(lastKana));
      version++;
      listeners.forEach((l) => l());
    }
    lastKana = '';
  }, true);
}

const useDictVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => version);

/** 名前の入力から読み仮名を推測する(日本語表示のときだけ) */
export const guessReading = (name: string) => (currentLang() === 'ja' ? readingDict.readingOf(name) : '');

/**
 * 読み仮名の入力欄用。自分で読み仮名を書き換えるまでは、名前の入力から自動で埋める。
 * initial があれば(すでに登録済みなら)それを使い、自動では変えない
 */
export function useAutoReading(name: string, initial = '', enabled = true) {
  const v = useDictVersion();
  const [own, setOwn] = useState<string | null>(initial || null);
  useEffect(() => { setOwn(initial || null); }, [initial]);
  const auto = own === null && enabled ? guessReading(name) : '';
  void v;
  return {
    reading: own ?? auto,
    /** 自動で入った読みか(画面に「入力から」と出す) */
    isAuto: own === null && !!auto,
    setReading: (r: string) => setOwn(r),
  };
}
