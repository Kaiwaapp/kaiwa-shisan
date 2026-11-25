import { back } from './hooks';
import { Header } from './components';
import { AiSettingsPanel } from './AiTools';
import { FEATURE_KEYS, FEATURE_LABELS, setFeature, useFeatures } from './features';
import { t } from '../i18n';

// 設定 > 使う機能。機能のオンオフとAI機能をここにまとめる。
// 新しい機能のスイッチは features.ts の FEATURE_KEYS / FEATURE_LABELS に足せばここに並ぶ。
// AIの機能は AiTools.tsx の AiSettingsPanel(AI機能を使う の下)に足す。
export function FeaturesScreen() {
  const feat = useFeatures();
  return (
    <div className="screen">
      <Header title={t('使う機能')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 設定')}</button>} />
      <div className="form">
        <section className="panel">
          <h2>{t('基本の機能')}</h2>
          <p className="muted small">{t('使わない機能はオフにすると画面に出なくなります。オフにしてもデータは消えず、オンに戻せば元どおり出ます。')}</p>
          <div className="feature-toggles">
            {FEATURE_KEYS.map((k) => (
              <label key={k} className="toggle feature">
                <input type="checkbox" checked={feat[k]} onChange={(e) => setFeature(k, e.target.checked)} />
                <span>
                  {t(FEATURE_LABELS[k].label)}
                  <span className="muted small block-note">{t(FEATURE_LABELS[k].note)}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
        <AiSettingsPanel />
      </div>
    </div>
  );
}
