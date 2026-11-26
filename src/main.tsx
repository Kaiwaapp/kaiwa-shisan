import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { Store } from './core/store';
import { IdbRepository } from './core/idbRepository';
import './ui/styles.css';
import { guessReading, installReadingCapture } from './ui/reading';
import { getFeatures } from './ui/features';
import { installTapFocus } from './ui/focus';
import { seedSamplesOnce } from './ui/samples';
import { installTheme } from './ui/theme';

registerSW({ immediate: true });
installTapFocus();
installTheme();

// iOSでデータが自動削除されにくくなるよう永続化を要求(ホーム画面追加時に効きやすい)
navigator.storage?.persist?.().catch(() => {});

const store = new Store(new IdbRepository());
// 初めて開いたときだけ見本を入れる(データがある端末には入れない)
const start = () => store.init().then(() => seedSamplesOnce(store));
start();
// 入力から読み仮名を拾い、新しく作る人・タグに付ける(無料。設定の人・タグの欄でそれぞれオフにできる)
installReadingCapture();
store.readingGuess = (name, kind) => (getFeatures()[kind === 'person' ? 'readingPerson' : 'readingTopic'] ? guessReading(name) : '');
// 読み込みに失敗したままアプリを閉じて開き直した(復帰した)ときは、もう一度読む
const retry = () => { if (!store.loaded && document.visibilityState === 'visible') start(); };
document.addEventListener('visibilitychange', retry);
addEventListener('pageshow', retry);

// キーボードが出ているか(見えている高さが大きく減ったら出ている)。編集画面の下の余白をこの間だけ付ける
const vv = window.visualViewport;
if (vv) {
  const onVv = () => document.documentElement.classList.toggle('kb-open', vv.height < window.innerHeight - 120);
  vv.addEventListener('resize', onVv);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
