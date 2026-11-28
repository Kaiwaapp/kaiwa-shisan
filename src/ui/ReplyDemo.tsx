import { useState } from 'react';
import { demoSuggest, type Suggestion } from '../core/ai';
import { t } from '../i18n';
import { Sheet } from './interact';

export function ReplyDemo({ people, tags, onApply }: {
  people: string[];
  tags: string[];
  onApply: (reply: string, people: string[], tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link small-link" onClick={() => setOpen(true)}>{t('AIチャットを試す')}</button>
      {open && (
        <ReplyDemoSheet people={people} tags={tags} onClose={() => setOpen(false)} onApply={onApply} />
      )}
    </>
  );
}

function ReplyDemoSheet({ people, tags, onClose, onApply }: {
  people: string[];
  tags: string[];
  onClose: () => void;
  onApply: (reply: string, people: string[], tags: string[]) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const reply = t('教えてくれてありがとう！ よかったら、もう少し詳しく聞かせて。');
  const preview = async () => {
    setBusy(true);
    try {
      setSuggestion(await demoSuggest(prompt, { people, topics: tags }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={t('AIチャット（お試し）')} onClose={onClose} cancelLabel={t('閉じる')}>
      <div className="form reply-demo" onKeyDown={(e) => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) onClose(); }}>
        <p className="muted small">{t('固定の返信例で操作を試せます。入力内容は端末の外に送信されません。')}</p>
        <label className="field">
          {t('相談したい内容')}
          <textarea className="textarea" rows={3} value={prompt} disabled={busy} onChange={(e) => {
            setPrompt(e.target.value);
            setSuggestion(null);
          }} />
        </label>
        <button type="button" className="btn block" disabled={busy || !prompt.trim()} onClick={preview}>
          {busy ? t('考え中…') : t('返信例を見る')}
        </button>
        {suggestion && (
          <section className="form" aria-live="polite">
            <div>
              <strong>{t('返信例')}</strong>
              <p>{reply}</p>
              {suggestion.people.length > 0 && <p className="muted small">{t('相手')} {suggestion.people.join('、')}</p>}
              <p className="muted small">{t('タグ')} {suggestion.topics.join('、')}</p>
            </div>
            <button type="button" className="btn primary block" onClick={() => {
              onApply(reply, suggestion.people, suggestion.topics);
              onClose();
            }}>{t('返信例を記録に入れる')}</button>
          </section>
        )}
      </div>
    </Sheet>
  );
}
