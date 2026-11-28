import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { demoSuggest, type Suggestion } from '../core/ai';
import { t } from '../i18n';
import { focusNoScroll } from './focus';

type Rect = { x: number; y: number; width: number; height: number };
type Action = 'move' | 'resize';
const EDGE = 8;

function visibleArea(): Rect {
  const viewport = window.visualViewport;
  return {
    x: viewport?.offsetLeft ?? 0,
    y: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function fitWindow(rect: Rect, area: Rect): Rect {
  const maxWidth = Math.max(1, area.width - EDGE * 2);
  const maxHeight = Math.max(1, area.height - EDGE * 2);
  const width = Math.min(maxWidth, Math.max(220, rect.width));
  const height = Math.min(maxHeight, Math.max(156, rect.height));
  return {
    x: Math.max(area.x + EDGE, Math.min(rect.x, area.x + area.width - width - EDGE)),
    y: Math.max(area.y + EDGE, Math.min(rect.y, area.y + area.height - height - EDGE)),
    width,
    height,
  };
}

function adjustWindow(rect: Rect, action: Action, dx: number, dy: number, area: Rect): Rect {
  if (action === 'move') return fitWindow({ ...rect, x: rect.x + dx, y: rect.y + dy }, area);
  return fitWindow({
    ...rect,
    width: Math.min(rect.width + dx, area.x + area.width - rect.x - EDGE),
    height: Math.min(rect.height + dy, area.y + area.height - rect.y - EDGE),
  }, area);
}

function snapToCorner(rect: Rect, area: Rect): Rect {
  const left = rect.x + rect.width / 2 < area.x + area.width / 2;
  const top = rect.y + rect.height / 2 < area.y + area.height / 2;
  return fitWindow({
    ...rect,
    x: left ? area.x + EDGE : area.x + area.width - rect.width - EDGE,
    y: top ? area.y + EDGE : area.y + area.height - rect.height - EDGE,
  }, area);
}

type Point = { x: number; y: number };

export function ReplyDemo({ people, tags, onApply }: {
  people: string[];
  tags: string[];
  onApply: (reply: string, people: string[], tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    if (trigger.current) focusNoScroll(trigger.current);
  };
  return (
    <>
      <button ref={trigger} type="button" className="link small-link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{t('AIチャットを試す')}</button>
      {open && (
        <ReplyDemoWindow people={people} tags={tags} onClose={close} onApply={onApply} />
      )}
    </>
  );
}

function ReplyDemoWindow({ people, tags, onClose, onApply }: {
  people: string[];
  tags: string[];
  onClose: () => void;
  onApply: (reply: string, people: string[], tags: string[]) => void;
}) {
  const heading = useId();
  const windowRef = useRef<HTMLElement>(null);
  const moveHandle = useRef<HTMLButtonElement>(null);
  const [area, setArea] = useState(visibleArea);
  const [position, setPosition] = useState<Rect>(() => ({
    x: area.x + area.width - 324,
    y: area.y + area.height - 376,
    width: Math.min(300, area.width - 32),
    height: Math.min(320, area.height - 96),
  }));
  const [snapping, setSnapping] = useState(false);
  const rect = fitWindow(position, area);
  const frame = useRef<number | null>(null);
  const gesture = useRef<{
    action: Action;
    pointers: Map<number, Point>;
    rect: Rect;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    const update = () => {
      const next = visibleArea();
      setArea((previous) => previous.x === next.x && previous.y === next.y
        && previous.width === next.width && previous.height === next.height ? previous : next);
    };
    const viewport = window.visualViewport;
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    if (moveHandle.current) focusNoScroll(moveHandle.current);
    return () => {
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);
  const start = (action: Action, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const point = { x: event.clientX, y: event.clientY };
    const active = gesture.current;
    if (active) {
      if (event.pointerType !== 'touch' || action !== 'move' || active.action !== 'move' || active.pointers.size !== 1) return;
      active.pointers.set(event.pointerId, point);
    } else {
      const box = windowRef.current?.getBoundingClientRect();
      const initial = box ? { x: box.x, y: box.y, width: box.width, height: box.height } : rect;
      gesture.current = { action, pointers: new Map([[event.pointerId, point]]), rect: initial, moved: snapping };
      setSnapping(false);
      setPosition(initial);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const change = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = gesture.current;
    const point = drag?.pointers.get(event.pointerId);
    if (!drag || !point) return;
    const next = { x: event.clientX, y: event.clientY };
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    if (!dx && !dy) return;
    const current = fitWindow(drag.rect, area);
    const other = [...drag.pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      const scale = Math.hypot(next.x - other.x, next.y - other.y) / Math.max(distance, 1);
      const resized = fitWindow({ ...current, width: current.width * scale, height: current.height * scale }, area);
      drag.rect = fitWindow({
        ...resized,
        x: current.x + (current.width - resized.width + dx) / 2,
        y: current.y + (current.height - resized.height + dy) / 2,
      }, area);
    } else {
      drag.rect = adjustWindow(current, drag.action, dx, dy, area);
    }
    drag.pointers.set(event.pointerId, next);
    drag.moved = true;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setPosition(drag.rect);
    });
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = gesture.current;
    if (!drag?.pointers.delete(event.pointerId) || drag.pointers.size) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    gesture.current = null;
    if (drag.moved) {
      setSnapping(true);
      setPosition(snapToCorner(drag.rect, area));
    }
  };
  const keyboard = (action: Action, event: KeyboardEvent<HTMLButtonElement>) => {
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    setSnapping(false);
    setPosition((previous) => adjustWindow(fitWindow(previous, area), action, dx * 16, dy * 16, area));
  };
  const handle = (action: Action) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(action, event),
    onPointerMove: change,
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyboard(action, event),
  });
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<{ request: string; suggestion?: Suggestion }[]>([]);
  const [busy, setBusy] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const reply = t('教えてくれてありがとう！ よかったら、もう少し詳しく聞かせて。');
  useEffect(() => {
    const list = transcript.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);
  const send = async () => {
    const request = prompt.trim();
    if (busy || !request) return;
    setPrompt('');
    setBusy(true);
    setMessages((previous) => [...previous, { request }]);
    try {
      const suggestion = await demoSuggest(request, { people, topics: tags });
      setMessages((previous) => [...previous.slice(0, -1), { request, suggestion }]);
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <section ref={windowRef} className={`reply-window${snapping ? ' snapping' : ''}`} role="dialog" aria-labelledby={heading}
      style={{ transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`, width: rect.width, height: rect.height }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) onClose(); }}>
      <header className="reply-window-header">
        <button ref={moveHandle} type="button" className="reply-window-move"
          aria-label={t('AIチャットの小窓を移動')} {...handle('move')}>
          <span id={heading}>{t('AIチャット（お試し）')}</span>
        </button>
        <button type="button" className="icon-btn" aria-label={t('閉じる')} onClick={onClose}>×</button>
      </header>
      <div ref={transcript} className="reply-demo" role="log">
        {messages.length === 0 && (
          <p className="muted small">{t('固定の返信例で操作を試せます。入力内容は端末の外に送信されません。')}</p>
        )}
        {messages.map(({ request, suggestion }, index) => (
          <div className="reply-turn" key={index}>
            <p className="reply-message reply-message-user">{request}</p>
            {suggestion ? (
              <div className="reply-message">
                <strong>{t('返信例')}</strong>
                <p>{reply}</p>
                {suggestion.people.length > 0 && <p className="muted small">{t('相手')} {suggestion.people.join('、')}</p>}
                <p className="muted small">{t('タグ')} {suggestion.topics.join('、')}</p>
                <button type="button" className="link small-link" onClick={() => {
                  onApply(reply, suggestion.people, suggestion.topics);
                  onClose();
                }}>{t('返信例を記録に入れる')}</button>
              </div>
            ) : <p className="muted small">{t('考え中…')}</p>}
          </div>
        ))}
      </div>
      <form className="reply-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea className="textarea" rows={1} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('メッセージを入力')} aria-label={t('メッセージを入力')} />
        <button type="submit" className="btn small" disabled={busy || !prompt.trim()}>{t('送信')}</button>
      </form>
      <footer className="reply-window-footer">
        <button type="button" className="reply-window-resize" aria-label={t('AIチャットの小窓のサイズを変更')} {...handle('resize')}>⌟</button>
      </footer>
    </section>,
    document.body,
  );
}
