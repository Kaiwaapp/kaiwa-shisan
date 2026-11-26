import { useEffect, useRef, useState } from 'react';
import { Sheet } from './interact';
import { t } from '../i18n';
import { getFeatures, setFeature } from './features';

/**
 * 保存していない変更があるまま戻る・閉じるときの確認(話題の編集画面と同じ)。
 * 変更がなければ確認せずにそのまま進む。設定「保存せずに戻るときの確認」でオフにできる。
 */
type Guard = { dirty: () => boolean; ask: (leave: () => void) => void };
const guards: Guard[] = [];

/** 画面の外側(見出しの戻るボタンなど)から戻るとき用。開いている編集に変更があれば確認する */
export function confirmLeave(leave: () => void) {
  const g = [...guards].reverse().find((x) => x.dirty());
  if (g && getFeatures().confirmDiscard) g.ask(leave);
  else leave();
}

/** save: 保存する(成功ならtrue)。渡すと「保存して戻る」を出す。保存のあと leave を続けて行う */
export function useDiscardGuard(dirty: boolean, save?: () => Promise<boolean | void> | boolean | void) {
  const [pending, setPending] = useState<{ leave: () => void } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const g: Guard = { dirty: () => dirtyRef.current, ask: (leave) => { setDontAsk(false); setPending({ leave }); } };
    guards.push(g);
    // ページを閉じる・再読み込みするときはブラウザの確認を出す
    const on = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault(); };
    addEventListener('beforeunload', on);
    return () => { guards.splice(guards.indexOf(g), 1); removeEventListener('beforeunload', on); };
  }, []);

  const guard = (leave: () => void) => {
    if (dirty && getFeatures().confirmDiscard) { setDontAsk(false); setPending({ leave }); } else leave();
  };
  const finish = () => { if (dontAsk) setFeature('confirmDiscard', false); setPending(null); };

  const sheet = pending && (
    <Sheet title={t('保存されていません')} onClose={() => setPending(null)} cancelLabel={t('編集を続ける')}>
      <p className="muted small sheet-note">{t('このまま戻ると、入力した内容は保存されません。')}</p>
      <label className="toggle sheet-check">
        <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
        <span>{t('今後表示しない')}</span>
      </label>
      {dontAsk && <p className="muted small sheet-note">{t('設定の「話題」でまた表示するようにできます')}</p>}
      {save && <button className="sheet-item" onClick={async () => { const { leave } = pending; finish(); if ((await save()) !== false) leave(); }}><span className="ic">✓</span>{t('保存して戻る')}</button>}
      <button className="sheet-item danger" onClick={() => { const { leave } = pending; finish(); dirtyRef.current = false; leave(); }}><span className="ic">✕</span>{t('保存せずに戻る')}</button>
    </Sheet>
  );
  return { guard, sheet };
}
