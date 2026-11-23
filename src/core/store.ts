import type { Repository } from './repository';
import { mergeData } from './backup';
import { newId, type AppData, type Entry, type ID, type Person, type Topic } from './types';
import { normalize } from './search';

type Listener = () => void;

export interface EntryInput {
  text: string;
  personIds: ID[];
  topicIds: ID[];
  talkedOn: string;
}

/** アプリの状態と操作。React非依存なのでネイティブ版でも使い回せる */
export class Store {
  private data: AppData = { people: [], topics: [], entries: [] };
  private listeners = new Set<Listener>();
  loaded = false;

  constructor(private repo: Repository) {}

  async init() {
    this.data = await this.repo.loadAll();
    this.loaded = true;
    this.emit();
  }

  get snapshot(): AppData { return this.data; }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };

  private emit() { for (const l of this.listeners) l(); }

  private set(next: AppData) { this.data = next; this.emit(); }

  // ---- 記録 ----
  async saveEntry(input: EntryInput, id?: ID): Promise<Entry> {
    const now = Date.now();
    const prev = id ? this.data.entries.find((e) => e.id === id) : undefined;
    const prevSource = new Map(prev?.topics.map((t) => [t.topicId, t.source]));
    const entry: Entry = {
      id: prev?.id ?? newId(),
      text: input.text.trim(),
      personIds: [...new Set(input.personIds)],
      topics: [...new Set(input.topicIds)].map((topicId) => ({
        topicId,
        source: prevSource.get(topicId) ?? 'manual',
      })),
      talkedOn: input.talkedOn,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putEntry(entry);
    this.set({
      ...this.data,
      entries: prev
        ? this.data.entries.map((e) => (e.id === entry.id ? entry : e))
        : [...this.data.entries, entry],
    });
    return entry;
  }

  async deleteEntry(id: ID) {
    await this.repo.deleteEntry(id);
    this.set({ ...this.data, entries: this.data.entries.filter((e) => e.id !== id) });
  }

  // ---- 人 ----
  findPersonByName(name: string) {
    const n = normalize(name.trim());
    return this.data.people.find((p) => normalize(p.name) === n);
  }

  async addPerson(name: string): Promise<Person> {
    const existing = this.findPersonByName(name);
    if (existing) return existing;
    const now = Date.now();
    const p: Person = { id: newId(), name: name.trim(), memo: '', createdAt: now, updatedAt: now };
    await this.repo.putPerson(p);
    this.set({ ...this.data, people: [...this.data.people, p] });
    return p;
  }

  async updatePerson(id: ID, patch: Partial<Pick<Person, 'name' | 'memo'>>) {
    const p = this.data.people.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch, updatedAt: Date.now() };
    await this.repo.putPerson(next);
    this.set({ ...this.data, people: this.data.people.map((x) => (x.id === id ? next : x)) });
  }

  /** 人を削除。記録自体は残し、その人の紐づけだけ外す */
  async deletePerson(id: ID) {
    const now = Date.now();
    const touched = this.data.entries
      .filter((e) => e.personIds.includes(id))
      .map((e) => ({ ...e, personIds: e.personIds.filter((x) => x !== id), updatedAt: now }));
    for (const e of touched) await this.repo.putEntry(e);
    await this.repo.deletePerson(id);
    const map = new Map(touched.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      people: this.data.people.filter((p) => p.id !== id),
      entries: this.data.entries.map((e) => map.get(e.id) ?? e),
    });
  }

  // ---- 話題 ----
  findTopicByName(name: string) {
    const n = normalize(name.trim().replace(/^#/, ''));
    return this.data.topics.find((t) => normalize(t.name) === n);
  }

  async addTopic(name: string): Promise<Topic> {
    const existing = this.findTopicByName(name);
    if (existing) return existing;
    const now = Date.now();
    const t: Topic = { id: newId(), name: name.trim().replace(/^#/, ''), createdAt: now, updatedAt: now };
    await this.repo.putTopic(t);
    this.set({ ...this.data, topics: [...this.data.topics, t] });
    return t;
  }

  async renameTopic(id: ID, name: string) {
    const t = this.data.topics.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, name: name.trim(), updatedAt: Date.now() };
    await this.repo.putTopic(next);
    this.set({ ...this.data, topics: this.data.topics.map((x) => (x.id === id ? next : x)) });
  }

  async deleteTopic(id: ID) {
    const now = Date.now();
    const touched = this.data.entries
      .filter((e) => e.topics.some((t) => t.topicId === id))
      .map((e) => ({ ...e, topics: e.topics.filter((t) => t.topicId !== id), updatedAt: now }));
    for (const e of touched) await this.repo.putEntry(e);
    await this.repo.deleteTopic(id);
    const map = new Map(touched.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      topics: this.data.topics.filter((t) => t.id !== id),
      entries: this.data.entries.map((e) => map.get(e.id) ?? e),
    });
  }

  // ---- バックアップ ----
  async importData(incoming: AppData, mode: 'merge' | 'replace') {
    const next = mode === 'merge' ? mergeData(this.data, incoming) : incoming;
    await this.repo.replaceAll(next);
    this.set(next);
  }
}
