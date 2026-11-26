import { lazy, Suspense } from 'react';
import { OrganizeScreen } from './OrganizeScreen';
import type { Store } from '../core/store';
import { StoreContext, go, switchTab, useLoadFailed, useLoaded, useRoute, useStore } from './hooks';
import { InteractProvider, useInteract } from './interact';
import { TrashScreen, AllEntriesScreen, FolderScreen, NameAllScreen, NameFolderScreen, PersonScreen, TopicScreen } from './screens';
import { EntryEditor } from './EntryEditor';
import { NewNameScreen } from './NewName';
import { PresetTopicsScreen } from './PresetTopics';
import { GroupScreen } from './groups';
import { SettingsScreen } from './SettingsScreen';
import { FeaturesScreen } from './FeaturesScreen';
import { GuideScreen } from './GuideScreen';
import { ProfileFieldsScreen } from './profile';
import { t, useLang } from '../i18n';
import { Fab, createItems } from './fab';
import { useFeatures } from './features';
import { AdBanner } from './ads';
import { Icon, type IconName } from './icons';
import { EventEditor, ScheduleScreen } from './schedule';

// 取り込み画面は開いたときだけ読み込む(普段の起動を重くしない)
const ImportScreen = lazy(() => import('./ImportScreen'));

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: '', label: '記録', icon: 'entry' },
  { key: 'people', label: '人', icon: 'person' },
  { key: 'topics', label: '話題', icon: 'topic' },
  { key: 'schedule', label: '予定', icon: 'schedule' },
  { key: 'settings', label: '設定', icon: 'settings' },
];

export function App({ store }: { store: Store }) {
  // 言語を切り替えたら全体を描き直す
  const lang = useLang();
  return (
    <StoreContext.Provider value={store}>
      <InteractProvider key={lang}>
        <Shell />
      </InteractProvider>
    </StoreContext.Provider>
  );
}

function Shell() {
  const loaded = useLoaded();
  const { path, query } = useRoute();
  const selecting = useInteract().sel.active;
  const feat = useFeatures();
  const [head, sub] = path;

  if (!loaded) return <Loading />;

  if (head === 'new' || head === 'edit') {
    return (
      <div className="app editor-app">
        <EntryEditor
          key={path.join('/') + query.toString()}
          id={head === 'edit' ? sub : undefined}
          initialPerson={query.get('person') ?? undefined}
          initialTopic={query.get('topic') ?? undefined}
          initialFolder={query.get('folder') ?? undefined}
          initialGroup={query.get('group') ?? undefined}
        />
      </div>
    );
  }

  if (head === 'event' && sub) {
    return (
      <div className="app editor-app">
        <EventEditor
          key={path.join('/') + query.toString()}
          id={sub === 'new' ? undefined : sub}
          initialPerson={query.get('person') ?? undefined}
          initialGroup={query.get('group') ?? undefined}
          initialDate={query.get('date') ?? undefined}
        />
      </div>
    );
  }

  if ((head === 'people' || head === 'topics') && sub === 'new') {
    return (
      <div className="app editor-app">
        <NewNameScreen kind={head === 'people' ? 'person' : 'topic'} folderId={query.get('folder')} />
      </div>
    );
  }

  if (head === 'topics' && sub === 'presets') {
    return (
      <div className="app editor-app">
        <PresetTopicsScreen />
      </div>
    );
  }

  let screen;
  const third = path[2];
  if (head === 'people' || head === 'topics') {
    const kind = head === 'people' ? 'person' : 'topic';
    if (kind === 'person' && sub === 'g' && third) screen = <GroupScreen key={third} id={third} />;
    else if (sub === 'all') screen = <NameAllScreen key={kind + 'all'} kind={kind} />;
    else if (sub === 'fav') screen = <NameAllScreen key={kind + 'fav'} kind={kind} fav />;
    else if (sub === 'f' && third) screen = <NameFolderScreen key={kind + third} kind={kind} folderId={third} />;
    else if (sub) screen = kind === 'person' ? <PersonScreen key={sub} id={sub} /> : <TopicScreen key={sub} id={sub} />;
    else screen = <NameFolderScreen key={kind + 'root'} kind={kind} folderId={null} />;
  }
  else if (head === 'schedule' && feat.schedule) screen = <ScheduleScreen />;
  else if (head === 'settings' && sub === 'profile') screen = <ProfileFieldsScreen />;
  else if (head === 'settings' && sub === 'guide') screen = <GuideScreen />;
  else if (head === 'settings') screen = sub === 'features' ? <FeaturesScreen /> : <SettingsScreen />;
  else if (head === 'import') screen = <Suspense fallback={<div className="loading">{t('読み込み中…')}</div>}><ImportScreen /></Suspense>;
  else if (head === 'organize') screen = <OrganizeScreen key={sub} scope={sub === 'person' || sub === 'topic' ? sub : 'entry'} />;
  else if (head === 'all') screen = <AllEntriesScreen key="all" />;
  else if (head === 'fav') screen = <AllEntriesScreen key="fav" fav />;
  else if (head === 'trash') screen = <TrashScreen />;
  else if (head === 'f' && sub) screen = <FolderScreen key={sub} folderId={sub} />;
  else screen = <FolderScreen key="root" folderId={null} />;

  const tab = head === 'f' || head === 'all' || head === 'fav' || head === 'trash' ? '' : head === 'import' ? 'settings' : head === 'schedule' && !feat.schedule ? '' : (head ?? '');
  const onSchedule = head === 'schedule' && feat.schedule;
  const fabLabel = head === 'people' ? t('人を追加') : head === 'topics' ? t('話題を追加') : onSchedule ? t('予定を追加') : t('記録を追加');
  const showFab = !selecting && head !== 'settings' && head !== 'import' && head !== 'organize' && head !== 'trash' && (!sub || head === 'f' || sub === 'f' || sub === 'all' || sub === 'fav');

  // 人タブ・話題タブでは人／話題を追加(開いているフォルダに入れる)。記録の追加は記録タブと各詳細画面の＋から
  const inFolder = sub === 'f' && third ? `?folder=${third}` : '';
  const fabTap = () => {
    if (onSchedule) go('/event/new');
    else if (head === 'people' || head === 'topics') go(`/${head}/new` + inFolder);
    else go(head === 'f' && sub ? `/new?folder=${sub}` : '/new');
  };
  // 長押しメニュー: その画面で作れるもの。フォルダは一覧(フォルダを出す画面)のときだけ、グループは人タブの一番上だけ
  const onFolderList = head === 'people' || head === 'topics' ? (!sub || sub === 'f') : (!head || head === 'f');
  const fabItems = createItems({
    first: { icon: <Icon name={head === 'people' ? 'person' : head === 'topics' ? 'topic' : onSchedule ? 'schedule' : 'entry'} />, label: fabLabel, run: fabTap },
    entry: head === 'people' || head === 'topics' || onSchedule ? '/new' : undefined,
    people: head !== 'people' ? '/people/new' : undefined,
    topics: head !== 'topics' ? '/topics/new' : undefined,
    group: head === 'people' && !sub && feat.groups,
    folder: onFolderList && feat.folders,
  });

  return (
    <div className={`app${feat.noAds ? '' : ' with-ad'}`}>
      <main className="main">{screen}</main>
      {!feat.noAds && <AdBanner />}
      {showFab && <Fab label={fabLabel} onTap={fabTap} items={fabItems} />}
      <nav className="tabbar">
        {TABS.filter((tb) => tb.key !== 'schedule' || feat.schedule).map((tb) => (
          <button
            key={tb.key}
            className={`tab ${tab === tb.key ? 'on' : ''}`}
            onClick={() => switchTab(tb.key)}
          >
            <span className="tab-icon"><Icon name={tb.icon} /></span>
            <span className="tab-label">{t(tb.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Loading() {
  const store = useStore();
  const failed = useLoadFailed();
  if (!failed) return <div className="loading">{t('読み込み中…')}</div>;
  return (
    <div className="loading">
      <p>{t('データを読み込めませんでした')}</p>
      <p>
        <button className="btn primary" onClick={() => store.init()}>{t('もう一度読み込む')}</button>
      </p>
      <p>
        <button className="link" onClick={() => location.reload()}>{t('アプリを再読み込み')}</button>
      </p>
    </div>
  );
}
