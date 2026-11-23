import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { Store } from './core/store';
import { IdbRepository } from './core/idbRepository';
import './ui/styles.css';

registerSW({ immediate: true });

// iOSでデータが自動削除されにくくなるよう永続化を要求(ホーム画面追加時に効きやすい)
navigator.storage?.persist?.().catch(() => {});

const store = new Store(new IdbRepository());
store.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
