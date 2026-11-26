import { useSyncExternalStore } from 'react';
import type { Store } from '../core/store';
import { usePref, useStore } from './hooks';
import { toast } from './interact';
import { t } from '../i18n';

const SEEDED_KEY = 'kaiwa-shisan:samplesSeeded';

/**
 * 初めて開いたときだけ見本を入れる。すでにデータがある端末には入れない。
 * 一度判定したら印を残し、ユーザーが全部消したあとに見本が戻ってくることはない
 */
export async function seedSamplesOnce(store: Store) {
  if (!store.loaded) return;
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    localStorage.setItem(SEEDED_KEY, String(Date.now()));
  } catch {
    return; // 印を残せないときは毎回入ってしまうので入れない
  }
  if (store.isEmpty) await store.addSamples().catch(() => {});
}

export function useHasSamples() {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => store.hasSamples);
}

export async function confirmRemoveSamples(store: Store) {
  if (!confirm(t('見本の話題・人・タグを消します。自分で書いた話題は消えません。よろしいですか？'))) return;
  await store.removeSamples();
  toast(t('見本を消しました'));
}

/** 話題タブの一番上に出す案内。「今後表示しない」で閉じられる(見本は設定からも消せる) */
export function SampleHint() {
  const store = useStore();
  const has = useHasSamples();
  const [hidden, setHidden] = usePref<'0' | '1'>('sampleHintHidden', '0');
  if (!has || hidden === '1') return null;
  return (
    <section className="panel preset-hint">
      <p>{t('見本の話題・人・タグが入っています。見本には「#見本」タグが付いています。')}</p>
      <div className="preset-bar">
        <button className="btn small-btn" onClick={() => confirmRemoveSamples(store)}>{t('見本を消す')}</button>
        <button className="link muted" onClick={() => { setHidden('1'); toast(t('見本は「#見本」タグから見られます')); }}>{t('今後表示しない')}</button>
      </div>
    </section>
  );
}
