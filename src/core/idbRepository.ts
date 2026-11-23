import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Repository } from './repository';
import type { AppData, Entry, Person, Topic } from './types';

interface Schema extends DBSchema {
  people: { key: string; value: Person };
  topics: { key: string; value: Topic };
  entries: { key: string; value: Entry };
}

const STORES = ['people', 'topics', 'entries'] as const;

export class IdbRepository implements Repository {
  private db: Promise<IDBPDatabase<Schema>>;

  constructor(name = 'kaiwa-shisan') {
    this.db = openDB<Schema>(name, 1, {
      upgrade(db) {
        for (const s of STORES) db.createObjectStore(s, { keyPath: 'id' });
      },
    });
  }

  async loadAll(): Promise<AppData> {
    const db = await this.db;
    const [people, topics, entries] = await Promise.all([
      db.getAll('people'),
      db.getAll('topics'),
      db.getAll('entries'),
    ]);
    return { people, topics, entries };
  }

  async putPerson(p: Person) { await (await this.db).put('people', p); }
  async deletePerson(id: string) { await (await this.db).delete('people', id); }
  async putTopic(t: Topic) { await (await this.db).put('topics', t); }
  async deleteTopic(id: string) { await (await this.db).delete('topics', id); }
  async putEntry(e: Entry) { await (await this.db).put('entries', e); }
  async deleteEntry(id: string) { await (await this.db).delete('entries', id); }

  async replaceAll(data: AppData) {
    const db = await this.db;
    const tx = db.transaction(STORES, 'readwrite');
    await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
    for (const p of data.people) tx.objectStore('people').put(p);
    for (const t of data.topics) tx.objectStore('topics').put(t);
    for (const e of data.entries) tx.objectStore('entries').put(e);
    await tx.done;
  }
}
