import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Repository } from './repository';
import type { AppData, Entry, Folder, Person, Topic } from './types';

interface Schema extends DBSchema {
  people: { key: string; value: Person };
  topics: { key: string; value: Topic };
  entries: { key: string; value: Entry };
  folders: { key: string; value: Folder };
}

const STORES = ['people', 'topics', 'entries', 'folders'] as const;

/** 開くのにこれ以上かかったら固まったとみなして開き直す */
const OPEN_TIMEOUT_MS = 4000;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB open timeout')), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

/**
 * iOS(Safari・ホーム画面のPWA)では、起動直後に IndexedDB が
 * 「開くのが終わらない」「接続が切れている(Connection to Indexed Database server lost)」
 * ことがある。そのため接続は使う時に開き、失敗・切断したら捨てて開き直す。
 */
export class IdbRepository implements Repository {
  private conn: Promise<IDBPDatabase<Schema>> | null = null;

  constructor(private name = 'kaiwa-shisan') {}

  private open(): Promise<IDBPDatabase<Schema>> {
    if (this.conn) return this.conn;
    const reset = () => { if (this.conn === p) this.conn = null; };
    const p = withTimeout(
      openDB<Schema>(this.name, 2, {
        upgrade(db) {
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        },
        // ほかのタブが古い版を開いたままのときなど。こちらは待つ(timeoutで開き直す)
        blocking() { p.then((db) => db.close()).catch(() => {}); reset(); },
        terminated: reset,
      }),
      OPEN_TIMEOUT_MS,
    );
    p.catch(reset);
    this.conn = p;
    return p;
  }

  /** 1回失敗したら接続を作り直してもう1回だけ試す */
  private async run<T>(fn: (db: IDBPDatabase<Schema>) => Promise<T>): Promise<T> {
    const first = this.open();
    try {
      return await fn(await first);
    } catch {
      if (this.conn === first) this.conn = null;
      first.then((db) => db.close()).catch(() => {});
      return fn(await this.open());
    }
  }

  loadAll(): Promise<AppData> {
    return this.run((db) => this.readAll(db));
  }

  private async readAll(db: IDBPDatabase<Schema>): Promise<AppData> {
    const [people, topics, entries, folders] = await Promise.all([
      db.getAll('people'),
      db.getAll('topics'),
      db.getAll('entries'),
      db.getAll('folders'),
    ]);
    // v1のデータには folderId がないので補う
    return { people, topics, entries: entries.map((e) => ({ ...e, folderId: e.folderId ?? null })), folders: folders.map((f) => ({ ...f, parentId: f.parentId ?? null })) };
  }

  async putPerson(p: Person) { await this.run((db) => db.put('people', p)); }
  async deletePerson(id: string) { await this.run((db) => db.delete('people', id)); }
  async putTopic(t: Topic) { await this.run((db) => db.put('topics', t)); }
  async deleteTopic(id: string) { await this.run((db) => db.delete('topics', id)); }
  async putEntry(e: Entry) { await this.run((db) => db.put('entries', e)); }
  async deleteEntry(id: string) { await this.run((db) => db.delete('entries', id)); }
  async putFolder(f: Folder) { await this.run((db) => db.put('folders', f)); }
  async deleteFolder(id: string) { await this.run((db) => db.delete('folders', id)); }

  replaceAll(data: AppData) {
    return this.run((db) => this.writeAll(db, data));
  }

  private async writeAll(db: IDBPDatabase<Schema>, data: AppData) {
    const tx = db.transaction(STORES, 'readwrite');
    await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
    for (const p of data.people) tx.objectStore('people').put(p);
    for (const t of data.topics) tx.objectStore('topics').put(t);
    for (const e of data.entries) tx.objectStore('entries').put(e);
    for (const f of data.folders) tx.objectStore('folders').put(f);
    await tx.done;
  }
}
