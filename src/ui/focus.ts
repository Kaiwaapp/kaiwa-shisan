import { pageScroller } from './hooks';

/**
 * 入力欄にフォーカスしたときの余計なスクロールを抑える。
 *
 * iPhoneのSafariは、入力欄が見えていてもキーボードを出すときに画面を少しずらす
 * (見出しが上に隠れる)。そこで、フォーカスする一瞬だけ入力欄を画面の上へ動かして
 * 「もう見えている」と思わせ、ずらさないようにする。
 * そのあとキーボードで本当に隠れるときだけ、隠れない分だけ自分でスクロールする。
 */

const isIOS = typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** キーボードが出たあと、入力欄が隠れていたら隠れない分だけ下へスクロールする */
function keepVisible(el: HTMLElement) {
  const vv = window.visualViewport;
  if (!vv) return;
  let done = false;
  const check = () => {
    if (done) return;
    done = true;
    vv.removeEventListener('resize', check);
    if (document.activeElement !== el) return;
    const r = el.getBoundingClientRect();
    const scroller = pageScroller(el);
    const scrollBottom = scroller instanceof HTMLElement ? scroller.getBoundingClientRect().bottom : Infinity;
    const bottom = Math.min(vv.offsetTop + vv.height, scrollBottom) - 12;
    // 複数行の欄は全部見えなくてよい(先頭の数行が見えれば書ける)
    const need = Math.min(r.bottom, r.top + 64) - bottom;
    if (need > 0) scroller.scrollBy({ top: need, behavior: 'smooth' });
  };
  vv.addEventListener('resize', check);
  setTimeout(check, 600);
}

/** スクロールさせずにフォーカスする */
export function focusNoScroll(el: HTMLElement) {
  if (document.activeElement === el) return;
  if (isIOS) {
    const prev = el.style.transform;
    el.style.transform = 'translateY(-2000px)';
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => { el.style.transform = prev; });
    keepVisible(el);
  } else {
    el.focus({ preventScroll: true });
  }
}

/** autoFocus の代わり。ref={autoFocusRef} で、表示したときにスクロールさせずにフォーカスする */
export const autoFocusRef = (el: HTMLElement | null) => { if (el) focusNoScroll(el); };

const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/**
 * iPhoneで1行の入力欄をタップしたときも同じようにずらさない。
 * 複数行の欄(textarea)はタップした位置にカーソルを置きたいので、Safariに任せる。
 */
export function installTapFocus() {
  if (!isIOS) return;
  let moved = false;
  document.addEventListener('touchstart', () => { moved = false; }, { passive: true, capture: true });
  document.addEventListener('touchmove', () => { moved = true; }, { passive: true, capture: true });
  document.addEventListener('touchend', (e) => {
    if (moved) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !TEXT_TYPES.has(el.getAttribute('type') ?? '')) return;
    if (el.disabled || el.readOnly || document.activeElement === el) return;
    e.preventDefault();
    focusNoScroll(el);
  }, { capture: true });
}
