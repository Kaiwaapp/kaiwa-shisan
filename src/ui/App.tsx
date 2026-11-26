import { lazy, Suspense, useCallback, useRef } from 'react';
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
import { RelationsScreen } from './RelationParts';
import { t, useLang } from '../i18n';
import { Fab, createItems } from './fab';
import { useFeatures } from './features';
import { AdBanner } from './ads';
import { Icon, type IconName } from './icons';
import { EventEditor, ScheduleScreen } from './schedule';

// 取り込み画面は開いたときだけ読み込む(普段の起動を重くしない)
const ImportScreen = lazy(() => import('./ImportScreen'));

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: '', label: '話題', icon: 'entry' },
  { key: 'people', label: '人', icon: 'person' },
  { key: 'topics', label: 'タグ', icon: 'topic' },
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

/* 中身が画面(タブバー・広告より上)に収まるときは、下の余白(タブバー・＋の分、編集画面の40px)を付けない。
   余白を付けたままだと、収まっているのに少しだけスクロールできてしまう(予定のカレンダー、新規話題など)。.app に fits を付け、styles.css で余白を消す */
function useFitRef() {
  const stop = useRef<() => void>(() => {});
  return useCallback((app: HTMLElement | null) => {
    stop.current();
    stop.current = () => {};
    if (!app) return;
    const check = () => {
      const padded = app.querySelector<HTMLElement>(':scope > .main, .screen.editor');
      if (!padded) return;
      let limit = window.innerHeight;
      app.querySelectorAll<HTMLElement>(':scope > .tabbar, :scope > .ad-banner').forEach((b) => { limit = Math.min(limit, b.getBoundingClientRect().top); });
      const pad = parseFloat(getComputedStyle(padded).paddingBottom) || 0;
      const bottom = padded.getBoundingClientRect().top + window.scrollY + padded.scrollHeight - pad;
      app.classList.toggle('fits', bottom <= limit);
    };
    const ro = new ResizeObserver(check);
    const watch = () => { ro.disconnect(); ro.observe(app); for (const c of Array.from(app.children)) ro.observe(c); check(); };
    const mo = new MutationObserver(watch);
    mo.observe(app, { childList: true });
    window.addEventListener('resize', check);
    stop.current = () => { ro.disconnect(); mo.disconnect(); window.removeEventListener('resize', check); };
    watch();
  }, []);
}

function Shell() {
  const loaded = useLoaded();
  const { path, query } = useRoute();
  const selecting = useInteract().sel.active;
  const feat = useFeatures();
  const fitRef = useFitRef();
  const [head, sub] = path;

  if (!loaded) return <Loading />;

  if (head === 'new' || head === 'edit') {
    return (
      <div className="app editor-app" ref={fitRef}>
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
      <div className="app editor-app" ref={fitRef}>
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
      <div className="app editor-app" ref={fitRef}>
        <NewNameScreen kind={head === 'people' ? 'person' : 'topic'} folderId={query.get('folder')} />
      </div>
    );
  }

  if (head === 'topics' && sub === 'presets') {
    return (
      <div className="app editor-app" ref={fitRef}>
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
    else screen = <NameFolderScreen key={kind + 'root' + (query.get('rel') ?? '')} kind={kind} folderId={null} rel={query.get('rel')} />;
  }
  else if (head === 'schedule' && feat.schedule) screen = <ScheduleScreen />;
  else if (head === 'settings' && sub === 'profile') screen = <ProfileFieldsScreen />;
  else if (head === 'settings' && sub === 'relations') screen = <RelationsScreen />;
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
  const fabLabel = head === 'people' ? t('人を追加') : head === 'topics' ? t('タグを追加') : onSchedule ? t('予定を追加') : t('話題を追加');
  const showFab = !selecting && head !== 'settings' && head !== 'import' && head !== 'organize' && head !== 'trash' && (!sub || head === 'f' || sub === 'f' || sub === 'all' || sub === 'fav');

  // 人タブ・タグタブでは人／タグを追加(開いているフォルダに入れる)。話題の追加は話題タブと各詳細画面の＋から
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
    <div className={`app${feat.noAds ? '' : ' with-ad'}`} ref={fitRef}>
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
