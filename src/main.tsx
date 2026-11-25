import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { Store } from './core/store';
import { IdbRepository } from './core/idbRepository';
import './ui/styles.css';
import { guessReading, installReadingCapture } from './ui/reading';
import { getFeatures } from './ui/features';

registerSW({ immediate: true });

// iOSでデータが自動削除されにくくなるよう永続化を要求(ホーム画面追加時に効きやすい)
navigator.storage?.persist?.().catch(() => {});

const store = new Store(new IdbRepository());
store.init();
// 入力から読み仮名を拾い、新しく作る人・話題に付ける(無料。設定の人・話題の欄でそれぞれオフにできる)
installReadingCapture();
store.readingGuess = (name, kind) => (getFeatures()[kind === 'person' ? 'readingPerson' : 'readingTopic'] ? guessReading(name) : '');
// 読み込みに失敗したままアプリを閉じて開き直した(復帰した)ときは、もう一度読む
const retry = () => { if (!store.loaded && document.visibilityState === 'visible') store.init(); };
document.addEventListener('visibilitychange', retry);
addEventListener('pageshow', retry);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
