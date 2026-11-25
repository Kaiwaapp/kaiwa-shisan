import { back, go } from './hooks';
import { Header } from './components';
import { AiSettingsPanel } from './AiTools';
import { FoldHeader, useFold } from './folders';
import { FEATURE_GROUPS, FEATURE_LABELS, setFeature, useFeatures, type Features } from './features';
import { t } from '../i18n';

// 設定 > 機能とカスタマイズ。機能のオンオフと、人・話題などの設定を機能のグループごとにまとめ、グループごとに折りたためる。
// 新しい設定は features.ts の FEATURE_GROUPS(と FEATURE_LABELS)に足せばここに並ぶ。
// AIの機能は AiTools.tsx の AiSettingsPanel(AI機能を使う の下)に足す。
export function FeaturesScreen() {
  return (
    <div className="screen">
      <Header title={t('機能とカスタマイズ')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 設定')}</button>} />
      <div className="form">
        <p className="muted small">{t('使わない機能はオフにすると画面に出なくなります。オフにしてもデータは消えず、オンに戻せば元どおり出ます。')}</p>
        {FEATURE_GROUPS.map((g) => <FeatureGroup key={g.key} gkey={g.key} title={g.title} items={g.items} />)}
        <AiGroup />
      </div>
    </div>
  );
}

function FeatureGroup({ gkey, title, items }: { gkey: string; title: string; items: (keyof Features)[] }) {
  const feat = useFeatures();
  const [open, setOpen] = useFold('features:' + gkey);
  return (
    <div className="feature-group">
      <FoldHeader label={t(title)} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <section className="panel">
          <div className="feature-toggles">
            {items.map((k) => (
              <div key={k} className="feature-item">
                <label className="toggle feature">
                  <input type="checkbox" checked={feat[k]} onChange={(e) => setFeature(k, e.target.checked)} />
                  <span>
                    {t(FEATURE_LABELS[k].label)}
                    <span className="muted small block-note">{t(FEATURE_LABELS[k].note)}</span>
                  </span>
                </label>
                {k === 'presetHint' && (
                  <button className="btn block small-btn" onClick={() => go('/topics/presets')}>{t('おすすめの話題から登録')}</button>
                )}
                {k === 'profile' && feat.profile && (
                  <button className="btn block small-btn" onClick={() => go('/settings/profile')}>{t('プロフィールの項目を編集')}</button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AiGroup() {
  const [open, setOpen] = useFold('features:ai');
  return (
    <div className="feature-group">
      <FoldHeader label="AI" open={open} onToggle={() => setOpen(!open)} />
      {open && <AiSettingsPanel />}
    </div>
  );
}
