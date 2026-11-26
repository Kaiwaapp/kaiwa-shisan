import { go } from './hooks';
import { SettingsSub } from './SettingsScreen';
import { AiSettingsPanel } from './AiTools';
import { FEATURE_GROUPS, FEATURE_LABELS, setFeature, useFeatures, type Features } from './features';
import { t } from '../i18n';

// 設定 > 話題・人・タグ… の各画面。機能のオンオフと、人・タグなどの設定をカテゴリごとに1画面にまとめる。
// 新しい設定は features.ts の FEATURE_GROUPS(と FEATURE_LABELS)に足せば、そのカテゴリの画面に並ぶ。
// AIの機能は AiTools.tsx の AiSettingsPanel(AI機能を使う の下)に足す。
export function FeaturesScreen({ group }: { group?: string }) {
  const g = FEATURE_GROUPS.find((x) => x.key === group);
  return (
    <SettingsSub title={g ? t(g.title) : 'AI'}>
      <p className="muted small">{t('使わない機能はオフにすると画面に出なくなります。オフにしてもデータは消えず、オンに戻せば元どおり出ます。')}</p>
      {g ? <FeatureGroup items={g.items} /> : <AiSettingsPanel />}
    </SettingsSub>
  );
}

function FeatureGroup({ items }: { items: (keyof Features)[] }) {
  const feat = useFeatures();
  return (
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
                  <button className="btn block small-btn" onClick={() => go('/topics/presets')}>{t('おすすめのタグから登録')}</button>
                )}
                {k === 'relations' && feat.relations && (
                  <button className="btn block small-btn" onClick={() => go('/settings/relations')}>{t('関係の選択肢を編集')}</button>
                )}
                {k === 'profile' && feat.profile && (
                  <button className="btn block small-btn" onClick={() => go('/settings/profile')}>{t('プロフィールの項目を編集')}</button>
                )}
              </div>
            ))}
          </div>
        </section>
  );
}
