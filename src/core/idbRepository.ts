import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Repository } from './repository';
import type { AppData, Entry, EntryImage, Folder, Group, Person, ScheduleEvent, Topic } from './types';

interface Schema extends DBSchema {
  people: { key: string; value: Person };
  topics: { key: string; value: Topic };
  entries: { key: string; value: Entry };
  folders: { key: string; value: Folder };
  groups: { key: string; value: Group };
  events: { key: string; value: ScheduleEvent };
  /** 添付画像。loadAll では読まない(一覧の読み込みを重くしないため) */
  images: { key: string; value: EntryImage };
}

const STORES = ['people', 'topics', 'entries', 'folders', 'groups', 'events'] as const;
const ALL_STORES = [...STORES, 'images'] as const;

/**
 * 開く処理が返ってこないときに、並行して開き直すまでの待ち時間(ミリ秒)。
 * iOSでは最初の1回目だけ返ってこないことがあり、2回目以降はすぐ開けるので、短い間隔で重ねて開く
 */
const HEDGE_DELAYS_MS = [250, 600, 1200, 2500];
/** これだけ待っても開けなければ失敗とする(呼び出し側で再試行) */
const OPEN_TIMEOUT_MS = 6000;
/**
 * 1件の書き込みがこれだけ待っても終わらなければ、接続が切れているとみなして開き直す。
 * iOSではアプリを裏に回して戻ると、接続が切れたまま put が返ってこないことがあり、
 * そのままだと保存ボタンが押せないままになる
 */
const WRITE_TIMEOUT_MS = 3000;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB timeout')), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

/**
 * iOS(Safari・ホーム画面のPWA)では、起動直後に IndexedDB が
 * 「開くのが終わらない」「接続が切れている(Connection to Indexed Database server lost)」
 * ことがある。そのため接続は使う時に開き、返ってこなければ少しずつ間をあけて並行で開き直し、
 * 最初に開けたものを使う。失敗・切断したら捨てて開き直す。
 */
export class IdbRepository implements Repository {
  private conn: Promise<IDBPDatabase<Schema>> | null = null;

  constructor(private name = 'kaiwa-shisan') {}

  private openOnce(onLost: () => void): Promise<IDBPDatabase<Schema>> {
    return openDB<Schema>(this.name, 5, {
      upgrade(db) {
        for (const s of ALL_STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      },
      terminated: onLost,
    });
  }

  private open(): Promise<IDBPDatabase<Schema>> {
    if (this.conn) return this.conn;
    const reset = () => { if (this.conn === p) this.conn = null; };
    const p = withTimeout(new Promise<IDBPDatabase<Schema>>((resolve, reject) => {
      let won: IDBPDatabase<Schema> | null = null;
      let pending = 0;
      let lastErr: unknown;
      const timers: ReturnType<typeof setTimeout>[] = [];
      let done = false;
      const attempt = () => {
        pending++;
        // iOSの固まりは indexedDB.databases() を呼ぶと抜けることがある(WebKitの既知の不具合への対処)
        try { void indexedDB.databases?.().catch(() => {}); } catch { /* noop */ }
        this.openOnce(reset).then((db) => {
          pending--;
          if (won) { db.close(); return; } // 遅れて開けた分は閉じる
          won = db;
          for (const t of timers) clearTimeout(t);
          db.addEventListener('close', reset);
          db.addEventListener('versionchange', () => { db.close(); reset(); });
          resolve(db);
        }, (e) => {
          pending--;
          lastErr = e;
          if (!won && pending === 0 && timers.length === HEDGE_DELAYS_MS.length && done) reject(lastErr);
        });
      };
      attempt();
      HEDGE_DELAYS_MS.forEach((ms, i) => timers.push(setTimeout(() => {
        if (won) return;
        if (i === HEDGE_DELAYS_MS.length - 1) done = true;
        attempt();
      }, ms)));
    }), OPEN_TIMEOUT_MS);
    p.catch(reset);
    this.conn = p;
    return p;
  }

  /** 1件の書き込み。返ってこなければ時間切れにして、接続を作り直して書き直す(同じ内容なので2回書いても問題ない) */
  private write<T>(fn: (db: IDBPDatabase<Schema>) => Promise<T>): Promise<T> {
    return this.run((db) => withTimeout(fn(db), WRITE_TIMEOUT_MS));
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
    // 開けても読み出しが返ってこないことがあるので、時間切れなら接続を作り直して読み直す
    return this.run((db) => withTimeout(this.readAll(db), 3000));
  }

  private async readAll(db: IDBPDatabase<Schema>): Promise<AppData> {
    const [people, topics, entries, folders, groups, events] = await Promise.all([
      db.getAll('people'),
      db.getAll('topics'),
      db.getAll('entries'),
      db.getAll('folders'),
      db.getAll('groups'),
      db.getAll('events'),
    ]);
    // v1のデータには folderId がないので補う
    return { people, topics, entries: entries.map((e) => ({ ...e, folderId: e.folderId ?? null })), folders: folders.map((f) => ({ ...f, parentId: f.parentId ?? null })), groups, events };
  }

  async putPerson(p: Person) { await this.write((db) => db.put('people', p)); }
  async deletePerson(id: string) { await this.write((db) => db.delete('people', id)); }
  async putTopic(t: Topic) { await this.write((db) => db.put('topics', t)); }
  async deleteTopic(id: string) { await this.write((db) => db.delete('topics', id)); }
  async putEntry(e: Entry) { await this.write((db) => db.put('entries', e)); }
  async deleteEntry(id: string) { await this.write((db) => db.delete('entries', id)); }
  async putFolder(f: Folder) { await this.write((db) => db.put('folders', f)); }
  async deleteFolder(id: string) { await this.write((db) => db.delete('folders', id)); }
  async putGroup(g: Group) { await this.write((db) => db.put('groups', g)); }
  async deleteGroup(id: string) { await this.write((db) => db.delete('groups', id)); }
  async putEvent(e: ScheduleEvent) { await this.write((db) => db.put('events', e)); }
  async deleteEvent(id: string) { await this.write((db) => db.delete('events', id)); }

  async putImage(img: EntryImage) { await this.run((db) => db.put('images', img)); }
  getImage(id: string) { return this.run((db) => db.get('images', id)); }
  async deleteImage(id: string) { await this.run((db) => db.delete('images', id)); }
  imageIds() { return this.run((db) => db.getAllKeys('images')); }

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
    for (const g of data.groups ?? []) tx.objectStore('groups').put(g);
    for (const ev of data.events ?? []) tx.objectStore('events').put(ev);
    await tx.done;
  }
}
