// 人のプロフィール。人の画面で見る・その場で書く。項目は設定で決めたひな形に沿う。
import { useDiscardGuard } from './discard';
import { lazy, Suspense, useMemo, useState } from 'react';
import { cleanProfile, hasProfile, type Entry, type Person, type PersonProfile, type ProfileExtra } from '../core/types';
import { profileReady } from '../core/ai';
import { useAiSettings } from './AiTools';
import { useStore, go, back } from './hooks';
import { FoldHeader, useFold } from './folders';
import { fieldLabel, fieldPlaceholder, profileFieldsApi, useProfileFields, visibleFields } from './profileFields';
import { Header } from './components';
import { t } from '../i18n';

// AIの自動入力は、編集中に使うときだけ読み込む(普段の起動を重くしない)
const ProfileAi = lazy(() => import('./ProfileAi'));

export function PersonProfileSection({ person, entries }: { person: Person; entries: Entry[] }) {
  const store = useStore();
  const all = useProfileFields();
  const fields = visibleFields(all);
  const [open, setOpen] = useFold('person-profile');
  const [editing, setEditing] = useState(false);
  const [ai] = useAiSettings();
  const p = person.profile;
  const filled = fields.filter((f) => p?.fields?.[f.id]?.trim());
  const extra = p?.extra ?? [];
  const count = filled.length + extra.length;

  if (editing) {
    return (
      <ProfileEditor
        person={person}
        entries={entries}
        showAi={profileReady(ai)}
        onCancel={() => setEditing(false)}
        onSave={async (next) => { await store.updatePerson(person.id, { profile: next }); setEditing(false); }}
      />
    );
  }

  if (!hasProfile(p)) {
    return (
      <div className="profile-empty">
        <button className="link small-link" onClick={() => setEditing(true)}>{t('＋ プロフィールを書く')}</button>
        {profileReady(ai) && <span className="muted small">{t('AIで自動入力もできます')}</span>}
      </div>
    );
  }

  return (
    <>
      <FoldHeader label={t('プロフィール')} count={count} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <button className="profile-view" onClick={() => setEditing(true)} aria-label={t('プロフィールを編集')}>
          <dl>
            {filled.map((f) => (
              <div key={f.id} className="profile-row"><dt>{fieldLabel(f)}</dt><dd>{p!.fields![f.id]}</dd></div>
            ))}
            {extra.map((x, i) => (
              <div key={'x' + i} className="profile-row"><dt>{x.label}</dt><dd>{x.value}</dd></div>
            ))}
          </dl>
        </button>
      )}
    </>
  );
}

function ProfileEditor({ person, entries, showAi, onCancel, onSave }: {
  person: Person;
  entries: Entry[];
  showAi: boolean;
  onCancel: () => void;
  onSave: (p: PersonProfile | undefined) => Promise<void> | void;
}) {
  const fields = visibleFields(useProfileFields());
  const [values, setValues] = useState<Record<string, string>>({ ...(person.profile?.fields ?? {}) });
  const [extra, setExtra] = useState<ProfileExtra[]>(person.profile?.extra?.map((x) => ({ ...x })) ?? []);
  /** AIから入った項目(色を付けて見せる) */
  const [fromAi, setFromAi] = useState<Set<string>>(new Set());

  const setValue = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));
  const setExtraAt = (i: number, patch: Partial<ProfileExtra>) => setExtra((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const applyAi = (got: PersonProfile) => {
    const hit = new Set(fromAi);
    for (const [id, v] of Object.entries(got.fields ?? {})) { setValue(id, v); hit.add(id); }
    if (got.extra?.length) {
      setExtra((xs) => {
        const next = [...xs];
        for (const x of got.extra!) {
          const i = next.findIndex((y) => y.label === x.label);
          if (i >= 0) next[i] = x; else next.push(x);
          hit.add('x:' + x.label);
        }
        return next;
      });
    }
    setFromAi(hit);
  };

  const current: PersonProfile = { fields: values, extra };
  const [initial] = useState(() => JSON.stringify(cleanProfile({ fields: values, extra }) ?? null));
  const { guard, sheet } = useDiscardGuard(JSON.stringify(cleanProfile(current) ?? null) !== initial, () => onSave(cleanProfile(current)));
  const texts = useMemo(
    () => [...entries].sort((a, b) => (b.talkedOn.localeCompare(a.talkedOn)) || b.updatedAt - a.updatedAt).map((e) => [e.title, e.text].filter(Boolean).join('\n')),
    [entries],
  );

  return (
    <div className="profile-edit">
      <div className="section-title">{t('プロフィール')}</div>
      {showAi && (
        <Suspense fallback={<p className="muted small">{t('読み込み中…')}</p>}>
          <ProfileAi person={person} texts={texts} fields={fields.map((f) => ({ id: f.id, label: fieldLabel(f) }))} current={current} onApply={applyAi} />
        </Suspense>
      )}
      <div className="profile-fields">
        {fields.map((f) => (
          <label key={f.id} className={'profile-field' + (fromAi.has(f.id) ? ' ai' : '')}>
            <span>{fieldLabel(f)}</span>
            <input value={values[f.id] ?? ''} placeholder={fieldPlaceholder(f)} onChange={(e) => setValue(f.id, e.target.value)} />
          </label>
        ))}
        {extra.map((x, i) => (
          <div key={i} className={'profile-field extra' + (fromAi.has('x:' + x.label) ? ' ai' : '')}>
            <input className="extra-label" value={x.label} placeholder={t('項目名')} onChange={(e) => setExtraAt(i, { label: e.target.value })} aria-label={t('項目名')} />
            <input value={x.value} onChange={(e) => setExtraAt(i, { value: e.target.value })} aria-label={x.label || t('内容')} />
            <button className="link small muted" onClick={() => setExtra((xs) => xs.filter((_, j) => j !== i))} aria-label={t('この項目を消す')}>✕</button>
          </div>
        ))}
      </div>
      <div className="profile-links">
        <button className="link small-link" onClick={() => setExtra((xs) => [...xs, { label: '', value: '' }])}>{t('＋ この人だけの項目を足す')}</button>
        <button className="link small-link muted" onClick={() => guard(() => go('/settings/profile'))}>{t('全員の項目を変える ›')}</button>
      </div>
      <div className="memo-actions">
        <button className="link" onClick={() => guard(onCancel)}>{t('キャンセル')}</button>
        <button className="link strong" onClick={() => onSave(cleanProfile(current))}>{t('保存')}</button>
      </div>
      {sheet}
    </div>
  );
}

/** 設定 > プロフィールの項目。全員に共通の項目の名前・並び・追加・非表示 */
export function ProfileFieldsScreen() {
  const all = useProfileFields();
  const shown = visibleFields(all);
  const hidden = all.filter((f) => f.hidden);
  const [adding, setAdding] = useState('');
  return (
    <div className="screen">
      <Header title={t('プロフィールの項目')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 戻る')}</button>} />
      <div className="form">
        <p className="muted small">{t('人のプロフィールに出す項目です。名前を変えたり、並べ替えたり、自分で足したりできます。消した項目は「使わない項目」に移るだけで、入れた内容は消えません。')}</p>
        <div className="panel field-defs">
          {shown.map((f, i) => (
            <div key={f.id} className="field-def">
              <input defaultValue={fieldLabel(f)} key={fieldLabel(f)} onBlur={(e) => profileFieldsApi.rename(f.id, e.target.value)} aria-label={t('項目名')} />
              <button className="btn small icon" disabled={i === 0} onClick={() => profileFieldsApi.move(f.id, -1)} aria-label={t('上へ')}>↑</button>
              <button className="btn small icon" disabled={i === shown.length - 1} onClick={() => profileFieldsApi.move(f.id, 1)} aria-label={t('下へ')}>↓</button>
              <button className="btn small icon danger" onClick={() => profileFieldsApi.hide(f.id, true)} aria-label={t('消す')}>✕</button>
            </div>
          ))}
          <div className="row-input">
            <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={t('新しい項目（例：身長）')}
              onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { profileFieldsApi.add(adding); setAdding(''); } }} />
            <button className="btn small primary" disabled={!adding.trim()} onClick={() => { profileFieldsApi.add(adding); setAdding(''); }}>{t('追加')}</button>
          </div>
        </div>
        {hidden.length > 0 && (
          <section className="panel">
            <h2>{t('使わない項目')}</h2>
            {hidden.map((f) => (
              <div key={f.id} className="field-def">
                <span className="field-def-name">{fieldLabel(f)}</span>
                <button className="btn small" onClick={() => profileFieldsApi.hide(f.id, false)}>{t('戻す')}</button>
              </div>
            ))}
          </section>
        )}
        <button className="btn block" onClick={() => { if (confirm(t('項目を初めの状態に戻しますか？\n自分で足した項目は「使わない項目」に移ります。'))) profileFieldsApi.reset(); }}>
          {t('初めの項目に戻す')}
        </button>
      </div>
    </div>
  );
}
