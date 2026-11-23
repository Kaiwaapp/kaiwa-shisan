import type { Store } from '../core/store';
import { StoreContext, go, switchTab, useData, useLoaded, useRoute } from './hooks';
import { EntriesScreen, FoldersScreen, PeopleScreen, PersonScreen, TopicScreen, TopicsScreen, currentFolderForNew } from './screens';
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
  if (head === 'people') screen = sub ? <PersonScreen key={sub} id={sub} /> : <PeopleScreen />;
  else if (head === 'topics') screen = sub ? <TopicScreen key={sub} id={sub} /> : <TopicsScreen />;
  else if (head === 'settings') screen = <SettingsScreen />;
  else if (head === 'folders') screen = <FoldersScreen />;
  else screen = <EntriesScreen />;

  const tab = head === 'folders' ? '' : (head ?? '');
  const showFab = head !== 'settings' && head !== 'folders' && !sub;
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
          const f = !head ? currentFolderForNew() : undefined;
          go(f ? `/new?folder=${f}` : '/new');
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
