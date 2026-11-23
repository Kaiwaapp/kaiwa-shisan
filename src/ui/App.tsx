import type { Store } from '../core/store';
import { StoreContext, go, switchTab, useData, useLoaded, useRoute } from './hooks';
import { AllEntriesScreen, FolderScreen, NameAllScreen, NameFolderScreen, PersonScreen, TopicScreen } from './screens';
import { EntryEditor } from './EntryEditor';
import { SettingsScreen } from './SettingsScreen';
import { needsBackupReminder } from './backupUi';

const TABS = [
  { key: '', label: '記録', icon: '✎' },
  { key: 'people', label: '人', icon: '☺' },
  { key: 'topics', label: '話題', icon: '#' },
  { key: 'settings', label: '設定', icon: '⚙' },
];

export function App({ store }: { store: Store }) {
  return (
    <StoreContext.Provider value={store}>
      <Shell />
    </StoreContext.Provider>
  );
}

function Shell() {
  const loaded = useLoaded();
  const data = useData();
  const { path, query } = useRoute();
  const [head, sub] = path;

  if (!loaded) return <div className="loading">読み込み中…</div>;

  if (head === 'new' || head === 'edit') {
    return (
      <EntryEditor
        key={path.join('/') + query.toString()}
        id={head === 'edit' ? sub : undefined}
        initialPerson={query.get('person') ?? undefined}
        initialTopic={query.get('topic') ?? undefined}
        initialFolder={query.get('folder') ?? undefined}
      />
    );
  }

  let screen;
  const third = path[2];
  if (head === 'people' || head === 'topics') {
    const kind = head === 'people' ? 'person' : 'topic';
    if (sub === 'all') screen = <NameAllScreen key={kind + 'all'} kind={kind} />;
    else if (sub === 'f' && third) screen = <NameFolderScreen key={kind + third} kind={kind} folderId={third} />;
    else if (sub) screen = kind === 'person' ? <PersonScreen key={sub} id={sub} /> : <TopicScreen key={sub} id={sub} />;
    else screen = <NameFolderScreen key={kind + 'root'} kind={kind} folderId={null} />;
  }
  else if (head === 'settings') screen = <SettingsScreen />;
  else if (head === 'all') screen = <AllEntriesScreen />;
  else if (head === 'f' && sub) screen = <FolderScreen key={sub} folderId={sub} />;
  else screen = <FolderScreen key="root" folderId={null} />;

  const tab = head === 'f' || head === 'all' ? '' : (head ?? '');
  const showFab = head !== 'settings' && (!sub || head === 'f' || sub === 'f' || sub === 'all');
  const remind = head !== 'settings' && needsBackupReminder(data);

  return (
    <div className="app">
      {remind && (
        <button className="reminder" onClick={() => go('/settings')}>
          しばらくバックアップしていません。設定から書き出しておきましょう ›
        </button>
      )}
      <main className="main">{screen}</main>
      {showFab && (
        <button className="fab" aria-label="記録を追加" onClick={() => {
          go(head === 'f' && sub ? `/new?folder=${sub}` : '/new');
        }}>
          ＋
        </button>
      )}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
