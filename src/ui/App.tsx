import { lazy, Suspense, useCallback, useRef } from 'react';
import { OrganizeScreen } from './OrganizeScreen';
import type { ImportDraft } from '../core/importers';
import { newId } from '../core/types';
import type { Store } from '../core/store';
import { StoreContext, go, switchTab, useLoadFailed, useLoaded, useRoute, useStore } from './hooks';
import { InteractProvider, useInteract } from './interact';
import { TrashScreen, AllEntriesScreen, FolderScreen, NameAllScreen, NameFolderScreen, PersonScreen, TopicScreen } from './screens';
import { EntryEditor } from './EntryEditor';
import { NewNameScreen } from './NewName';
import { PresetTopicsScreen } from './PresetTopics';
import { GroupScreen } from './groups';
import { BackupSettingsScreen, DisplaySettingsScreen, PremiumSettingsScreen, SettingsScreen } from './SettingsScreen';
import { FeaturesScreen } from './FeaturesScreen';
import { ProfileFieldsScreen } from './profile';
import { RelationsScreen } from './RelationParts';
import { t, useLang } from '../i18n';
import { Fab, createItems } from './fab';
import { useFeatures } from './features';
import { AdBanner } from './ads';
import { Icon, type IconName } from './icons';
import { EventEditor, ScheduleScreen, TodoEditor, useScheduleBadge } from './schedule';

// 取り込み画面は開いたときだけ読み込む(普段の起動を重くしない)
const ImportScreen = lazy(() => import('./ImportScreen'));
// 使い方ガイドは文と画像が多いので、開いたときだけ読み込む
const GuideScreen = lazy(() => import('./GuideScreen'));

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

/* 中身が画面(タブバー・広告より上)に余白16px付きで収まるときは .app に fits を付け、＋ボタンの分の下の余白(88px)を付けない(styles.css)。
   付けたままだと、収まっているのに少しだけスクロールできてしまう(予定のカレンダーなど)。最低限の余白16pxはいつも残す */
const FIT_GAP = 16;
function useFitRef() {
  const stop = useRef<() => void>(() => {});
  return useCallback((app: HTMLElement | null) => {
    stop.current();
    stop.current = () => {};
    if (!app) return;
    const check = () => {
      const padded = app.querySelector<HTMLElement>(':scope > .main');
      if (!padded) return;
      let limit = window.innerHeight;
      app.querySelectorAll<HTMLElement>(':scope > .tabbar, :scope > .ad-banner').forEach((b) => { limit = Math.min(limit, b.getBoundingClientRect().top); });
      const pad = parseFloat(getComputedStyle(padded).paddingBottom) || 0;
      const bottom = padded.getBoundingClientRect().top + (getComputedStyle(padded).overflowY === 'auto' ? 0 : window.scrollY) + padded.scrollHeight - pad;
      app.classList.toggle('fits', bottom + FIT_GAP <= limit);
    };
    let frame = 0;
    // 観測中に .fits を変えて要素の高さを更新すると、ResizeObserver の通知が中断される。
    const scheduleCheck = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        check();
      });
    };
    const ro = new ResizeObserver(scheduleCheck);
    const watch = () => {
      ro.disconnect();
      ro.observe(app);
      for (const child of app.children) ro.observe(child);
      scheduleCheck();
    };
    const mo = new MutationObserver(watch);
    mo.observe(app, { childList: true });
    window.addEventListener('resize', scheduleCheck);
    stop.current = () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleCheck);
    };
    watch();
  }, []);
}

function Shell() {
  const loaded = useLoaded();
  const { path, query } = useRoute();
  const selecting = useInteract().sel.active;
  const feat = useFeatures();
  const badge = useScheduleBadge();
  const fitRef = useFitRef();
  const [head, sub] = path;
  const reply = useRef<{ key: string; draft: ImportDraft } | null>(null);
  const openReply = (draft: ImportDraft) => {
    const key = newId();
    reply.current = { key, draft };
    go('/new?reply=' + key);
  };

  if (!loaded) return <Loading />;

  if (head === 'new' || head === 'edit') {
    return (
      <div className="app editor-app" ref={fitRef}>
        <EntryEditor
          key={path.join('/') + query.toString()}
          id={head === 'edit' ? sub : undefined}
          initialReply={head === 'new' && reply.current?.key === query.get('reply') ? reply.current?.draft : undefined}
          initialPerson={query.get('person') ?? undefined}
          initialTopic={query.get('topic') ?? undefined}
          initialFolder={query.get('folder') ?? undefined}
          initialGroup={query.get('group') ?? undefined}
        />
      </div>
    );
  }

  if (head === 'todo' && sub) {
    return (
      <div className="app editor-app">
        <TodoEditor key={path.join('/') + query.toString()} id={sub === 'new' ? undefined : sub} initialPerson={query.get('person') ?? undefined} />
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
  else if (head === 'schedule' && feat.schedule) screen = <ScheduleScreen todo={sub === 'todo' && feat.todo} />;
  else if (head === 'settings' && sub === 'profile') screen = <ProfileFieldsScreen />;
  else if (head === 'settings' && sub === 'relations') screen = <RelationsScreen />;
  else if (head === 'settings' && sub === 'guide') screen = <Suspense fallback={<div className="loading">{t('読み込み中…')}</div>}><GuideScreen /></Suspense>;
  else if (head === 'settings' && sub === 'features' && third) screen = <FeaturesScreen key={third} group={third === 'ai' ? undefined : third} />;
  else if (head === 'settings' && sub === 'display') screen = <DisplaySettingsScreen />;
  else if (head === 'settings' && sub === 'premium') screen = <PremiumSettingsScreen />;
  else if (head === 'settings' && sub === 'backup') screen = <BackupSettingsScreen />;
  else if (head === 'settings') screen = <SettingsScreen />;
  else if (head === 'import') {
    const linkedReply = sub === 'reply' ? query.get('data') : null;
    screen = <Suspense fallback={<div className="loading">{t('読み込み中…')}</div>}>
      <ImportScreen key={linkedReply ?? sub} directReply={sub === 'reply'} linkedReply={linkedReply} onOpenReply={openReply} />
    </Suspense>;
  }
  else if (head === 'organize') screen = <OrganizeScreen key={sub} scope={sub === 'person' || sub === 'topic' ? sub : 'entry'} />;
  else if (head === 'all') screen = <AllEntriesScreen key="all" />;
  else if (head === 'fav') screen = <AllEntriesScreen key="fav" fav />;
  else if (head === 'trash') screen = <TrashScreen />;
  else if (head === 'f' && sub) screen = <FolderScreen key={sub} folderId={sub} />;
  else screen = <FolderScreen key="root" folderId={null} />;

  const tab = head === 'f' || head === 'all' || head === 'fav' || head === 'trash' ? '' : head === 'import' ? 'settings' : head === 'schedule' && !feat.schedule ? '' : (head ?? '');
  const onSchedule = head === 'schedule' && feat.schedule;
  const onTodo = onSchedule && sub === 'todo' && feat.todo;
  const fabLabel = head === 'people' ? t('人を追加') : head === 'topics' ? t('タグを追加') : onTodo ? t('ToDoを追加') : onSchedule ? t('予定を追加') : t('話題を追加');
  const showFab = !selecting && head !== 'settings' && head !== 'import' && head !== 'organize' && head !== 'trash' && (!sub || onSchedule || head === 'f' || sub === 'f' || sub === 'all' || sub === 'fav');

  // 人タブ・タグタブでは人／タグを追加(開いているフォルダに入れる)。話題の追加は話題タブと各詳細画面の＋から
  const inFolder = sub === 'f' && third ? `?folder=${third}` : '';
  const fabTap = () => {
    if (onTodo) go('/todo/new');
    else if (onSchedule) go('/event/new');
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
    <div className={`app tabbed-app${feat.noAds ? '' : ' with-ad'}`} ref={fitRef}>
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
            <span className="tab-icon"><Icon name={tb.icon} />{tb.key === 'schedule' && badge > 0 && <span className="tab-badge" aria-label={t('今日・明日の予定とToDo {n}件', { n: badge })}>{badge > 99 ? '99+' : badge}</span>}</span>
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
