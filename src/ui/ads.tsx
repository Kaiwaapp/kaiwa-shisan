// 広告とクレジットの表示確認用のダミー。本物の広告SDKはまだ入れていない(将来の課金機能の置き場)。
// クレジットは端末ごとに localStorage に置く(バックアップには含めない)。AI機能での消費はまだない。
import { useEffect, useState, useSyncExternalStore } from 'react';
import { go } from './hooks';
import { t } from '../i18n';

const KEY = 'kaiwa-shisan:credits';
/** 動画広告1回でもらえるクレジット */
export const REWARD_CREDITS = 10;
/** ダミー動画の長さ(秒) */
const VIDEO_SEC = 5;

const loadCredits = () => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
};
let credits = loadCredits();
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useCredits = () => useSyncExternalStore(subscribe, () => credits);
export function addCredits(n: number) {
  credits += n;
  try { localStorage.setItem(KEY, String(credits)); } catch { /* 保存できない環境では今回だけ */ }
  listeners.forEach((f) => f());
}

/** 設定の「有料機能」の欄を開く(設定画面にいるときもそこまでスクロール) */
function showPremium() {
  go('/settings');
  setTimeout(() => document.getElementById('premium')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

/** 表示確認用のダミーのバナー広告(320x50)。タブバーの上に出し、記録の編集画面などには出さない */
export function AdBanner() {
  return (
    <aside className="ad-banner" aria-label={t('広告')}>
      <div className="ad-box">
        <span className="ad-tag">{t('広告')}</span>
        <span className="ad-text">{t('バナー広告の表示確認用です')}</span>
        <button className="ad-off" onClick={showPremium}>{t('非表示にする')}</button>
      </div>
    </aside>
  );
}

/** 動画広告を見てクレジットをもらう(ダミー動画を数秒出して、最後まで見たら付与) */
export function RewardAd({ onClose }: { onClose: () => void }) {
  const [left, setLeft] = useState(VIDEO_SEC);
  useEffect(() => {
    if (left <= 0) { addCredits(REWARD_CREDITS); return; }
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const done = left <= 0;
  return (
    <div className="reward-ad" role="dialog" aria-label={t('動画広告')}>
      <div className="reward-top">
        <span className="ad-tag">{t('広告')}</span>
        <span>{done ? '' : t('あと{n}秒', { n: left })}</span>
        <button className="reward-close" onClick={onClose} aria-label={t('閉じる')}>✕</button>
      </div>
      <div className="reward-video">
        {done ? (
          <>
            <p className="reward-got">{t('{n}クレジットを獲得しました', { n: REWARD_CREDITS })}</p>
            <button className="btn primary" onClick={onClose}>{t('閉じる')}</button>
          </>
        ) : (
          <>
            <div className="reward-bar"><span style={{ width: `${((VIDEO_SEC - left) / VIDEO_SEC) * 100}%` }} /></div>
            <p>{t('動画広告の表示確認用です')}</p>
            <p className="small">{t('最後まで見るとクレジットがもらえます。途中で閉じるともらえません。')}</p>
          </>
        )}
      </div>
    </div>
  );
}
