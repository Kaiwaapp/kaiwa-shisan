// 人の「関係」(友達・家族など)の画面部品: 編集で選ぶチップ、人タブの絞り込み、設定の選択肢の編集
import { useMemo, useState } from 'react';
import { useData, go, back } from './hooks';
import { FoldHeader, useFold } from './folders';
import { Header } from './components';
import { relationLabel, relationsApi, useRelations, visibleRelations } from './relations';
import { t } from '../i18n';

/** 人の編集で関係を1つ選ぶ。選んだチップをもう一度押すと外す */
export function RelationPicker({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const all = useRelations();
  const shown = visibleRelations(all);
  // 選択肢から消したものが付いている人は、外すまでチップを出しておく
  const kept = value && !shown.some((r) => r.id === value) ? all.find((r) => r.id === value) : undefined;
  return (
    <div className="chips relation-chips">
      {[...shown, ...(kept ? [kept] : [])].map((r) => (
        <button key={r.id} type="button" className={`chip group ${value === r.id ? 'on' : ''}`} aria-pressed={value === r.id}
          onClick={() => onChange(value === r.id ? undefined : r.id)}>
          {relationLabel(r)}
        </button>
      ))}
    </div>
  );
}

/** 人タブの上に出す関係の絞り込み。付いている人がいる関係だけ出す */
export function RelationBar({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const data = useData();
  const all = useRelations();
  const [open, setOpen] = useFold('relations');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data.people) if (p.relation) m.set(p.relation, (m.get(p.relation) ?? 0) + 1);
    return m;
  }, [data.people]);
  const used = visibleRelations(all).filter((r) => counts.has(r.id));
  if (!used.length) return null;
  return (
    <div className="group-bar">
      <FoldHeader label={t('関係')} count={used.length} open={open || !!value} onToggle={() => { if (value) onChange(null); setOpen(!(open || value)); }} />
      {(open || value) && (
        <div className="chips folders">
          {used.map((r) => (
            <button key={r.id} className={`chip group ${value === r.id ? 'on' : ''}`} aria-pressed={value === r.id} onClick={() => onChange(value === r.id ? null : r.id)}>
              {relationLabel(r)} <span className="n">{counts.get(r.id)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 設定: 関係の選択肢を編集 */
export function RelationsScreen() {
  const all = useRelations();
  const shown = visibleRelations(all);
  const hidden = all.filter((r) => r.hidden);
  const [adding, setAdding] = useState('');
  const add = () => { if (adding.trim()) { relationsApi.add(adding); setAdding(''); } };
  return (
    <div className="screen">
      <Header title={t('関係の選択肢')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 戻る')}</button>} />
      <div className="form">
        <p className="muted small">{t('人の編集で選ぶ関係です。名前を変えたり、並べ替えたり、自分で足したりできます。消した選択肢は「使わない選択肢」に移るだけで、人に付けた関係は消えません。')}</p>
        <div className="panel field-defs">
          {shown.map((r, i) => (
            <div key={r.id} className="field-def">
              <input defaultValue={relationLabel(r)} key={relationLabel(r)} onBlur={(e) => relationsApi.rename(r.id, e.target.value)} aria-label={t('選択肢の名前')} />
              <button className="btn small icon" disabled={i === 0} onClick={() => relationsApi.move(r.id, -1)} aria-label={t('上へ')}>↑</button>
              <button className="btn small icon" disabled={i === shown.length - 1} onClick={() => relationsApi.move(r.id, 1)} aria-label={t('下へ')}>↓</button>
              <button className="btn small icon danger" onClick={() => relationsApi.hide(r.id, true)} aria-label={t('消す')}>✕</button>
            </div>
          ))}
          <div className="row-input">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={t('新しい選択肢（例：大学）')}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) add(); }} />
            <button className="btn small primary" disabled={!adding.trim()} onClick={add}>{t('追加')}</button>
          </div>
        </div>
        {hidden.length > 0 && (
          <section className="panel">
            <h2>{t('使わない選択肢')}</h2>
            {hidden.map((r) => (
              <div key={r.id} className="field-def">
                <span className="field-def-name">{relationLabel(r)}</span>
                <button className="btn small" onClick={() => relationsApi.hide(r.id, false)}>{t('戻す')}</button>
              </div>
            ))}
          </section>
        )}
        <button className="btn block" onClick={() => { if (confirm(t('選択肢を初めの状態に戻しますか？\n自分で足した選択肢は「使わない選択肢」に移ります。'))) relationsApi.reset(); }}>
          {t('初めの選択肢に戻す')}
        </button>
      </div>
    </div>
  );
}

/** 人の画面の上に出す関係のチップ。押すと人タブでその関係に絞り込む */
export function RelationBadge({ id }: { id: string | undefined }) {
  const all = useRelations();
  const r = id ? all.find((x) => x.id === id) : undefined;
  if (!r) return null;
  return <button className="chip group small" onClick={() => go('/people?rel=' + encodeURIComponent(r.id))}>{relationLabel(r)}</button>;
}
