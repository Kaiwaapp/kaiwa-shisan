import type { Repository } from './repository';
import { mergeData } from './backup';
import { newId, type AppData, type Entry, type Folder, type FolderScope, type ID, type Person, type Topic } from './types';
import { normalize } from './search';

type Listener = () => void;

export interface EntryInput {
  text: string;
  personIds: ID[];
  topicIds: ID[];
  /** 保存時に新しく作る人・話題の名前 */
  newPeople?: string[];
  newTopics?: string[];
  /** AIの提案から付けた話題(既存のid・新規の名前)。source を 'ai' にする */
  aiTopicIds?: ID[];
  aiNewTopics?: string[];
  talkedOn: string;
  folderId?: ID | null;
}

/** アプリの状態と操作。React非依存なのでネイティブ版でも使い回せる */
export class Store {
  private data: AppData = { people: [], topics: [], entries: [], folders: [] };
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
    // 新規の人・話題は記録の保存時にはじめて作る(キャンセルしたらゴミが残らない)
    const personIds = [...input.personIds];
    for (const name of input.newPeople ?? []) if (name.trim()) personIds.push((await this.addPerson(name)).id);
    const topicIds = [...input.topicIds];
    const aiIds = new Set(input.aiTopicIds ?? []);
    const aiNew = new Set((input.aiNewTopics ?? []).map((n) => normalize(n.trim())));
    for (const name of input.newTopics ?? []) {
      if (!name.trim()) continue;
      const t = await this.addTopic(name);
      topicIds.push(t.id);
      if (aiNew.has(normalize(name.trim()))) aiIds.add(t.id);
    }
    const entry: Entry = {
      id: prev?.id ?? newId(),
      text: input.text.trim(),
      personIds: [...new Set(personIds)],
      folderId: input.folderId === undefined ? (prev?.folderId ?? null) : input.folderId,
      topics: [...new Set(topicIds)].map((topicId) => ({
        topicId,
        source: prevSource.get(topicId) ?? (aiIds.has(topicId) ? 'ai' : 'manual'),
      })),
      talkedOn: input.talkedOn,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      viewedAt: now,
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

  async addPerson(name: string, folderId: ID | null = null): Promise<Person> {
    const existing = this.findPersonByName(name);
    if (existing) return existing;
    const now = Date.now();
    const p: Person = { id: newId(), name: name.trim(), memo: '', folderId, createdAt: now, updatedAt: now, selectedAt: now };
    await this.repo.putPerson(p);
    this.set({ ...this.data, people: [...this.data.people, p] });
    return p;
  }

  async updatePerson(id: ID, patch: Partial<Pick<Person, 'name' | 'memo' | 'reading' | 'folderId'>>) {
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

  async addTopic(name: string, folderId: ID | null = null): Promise<Topic> {
    const existing = this.findTopicByName(name);
    if (existing) return existing;
    const now = Date.now();
    const t: Topic = { id: newId(), name: name.trim().replace(/^#/, ''), folderId, createdAt: now, updatedAt: now, selectedAt: now };
    await this.repo.putTopic(t);
    this.set({ ...this.data, topics: [...this.data.topics, t] });
    return t;
  }

  async updateTopic(id: ID, patch: Partial<Pick<Topic, 'name' | 'reading' | 'folderId'>>) {
    const t = this.data.topics.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, ...patch, updatedAt: Date.now() };
    await this.repo.putTopic(next);
    this.set({ ...this.data, topics: this.data.topics.map((x) => (x.id === id ? next : x)) });
  }

  async renameTopic(id: ID, name: string, reading?: string) {
    const t = this.data.topics.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, name: name.trim(), reading: reading ?? t.reading, updatedAt: Date.now() };
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

  /** source の人を target に統合。記録の紐づけを付け替え、メモを足して source を消す */
  async mergePeople(sourceId: ID, targetId: ID) {
    if (sourceId === targetId) return;
    const src = this.data.people.find((p) => p.id === sourceId);
    const dst = this.data.people.find((p) => p.id === targetId);
    if (!src || !dst) return;
    const now = Date.now();
    const touched = this.data.entries
      .filter((e) => e.personIds.includes(sourceId))
      .map((e) => ({
        ...e,
        personIds: [...new Set(e.personIds.map((x) => (x === sourceId ? targetId : x)))],
        updatedAt: now,
      }));
    for (const e of touched) await this.repo.putEntry(e);
    const memo = [dst.memo, src.memo].filter((m) => m.trim()).join('\n');
    const merged: Person = { ...dst, memo, updatedAt: now };
    await this.repo.putPerson(merged);
    await this.repo.deletePerson(sourceId);
    const map = new Map(touched.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      people: this.data.people.filter((p) => p.id !== sourceId).map((p) => (p.id === targetId ? merged : p)),
      entries: this.data.entries.map((e) => map.get(e.id) ?? e),
    });
  }

  async mergeTopics(sourceId: ID, targetId: ID) {
    if (sourceId === targetId) return;
    if (!this.data.topics.some((t) => t.id === targetId)) return;
    const now = Date.now();
    const touched = this.data.entries
      .filter((e) => e.topics.some((t) => t.topicId === sourceId))
      .map((e) => {
        const seen = new Set<ID>();
        const topics = e.topics
          .map((t) => (t.topicId === sourceId ? { ...t, topicId: targetId } : t))
          // 同じ話題が重なったら手動タグを優先して1つに
          .sort((a, b) => (a.source === 'manual' ? -1 : 0) - (b.source === 'manual' ? -1 : 0))
          .filter((t) => (seen.has(t.topicId) ? false : (seen.add(t.topicId), true)));
        return { ...e, topics, updatedAt: now };
      });
    for (const e of touched) await this.repo.putEntry(e);
    await this.repo.deleteTopic(sourceId);
    const map = new Map(touched.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      topics: this.data.topics.filter((t) => t.id !== sourceId),
      entries: this.data.entries.map((e) => map.get(e.id) ?? e),
    });
  }

  // ---- フォルダ(入れ子可) ----
  async addFolder(name: string, parentId: ID | null = null, scope: FolderScope = 'entry'): Promise<Folder> {
    const n = normalize(name.trim());
    const existing = this.data.folders.find(
      (f) => folderScope(f) === scope && f.parentId === parentId && normalize(f.name) === n,
    );
    if (existing) return existing;
    const now = Date.now();
    const f: Folder = { id: newId(), name: name.trim(), parentId, scope, createdAt: now, updatedAt: now };
    await this.repo.putFolder(f);
    this.set({ ...this.data, folders: [...this.data.folders, f] });
    return f;
  }

  private putFolderState = async (next: Folder) => {
    await this.repo.putFolder(next);
    this.set({ ...this.data, folders: this.data.folders.map((x) => (x.id === next.id ? next : x)) });
  };

  async renameFolder(id: ID, name: string) {
    const f = this.data.folders.find((x) => x.id === id);
    if (!f || !name.trim()) return;
    await this.putFolderState({ ...f, name: name.trim(), updatedAt: Date.now() });
  }

  /** フォルダを別のフォルダの中へ移す。自分や自分の子孫の中へは移せない */
  async moveFolder(id: ID, parentId: ID | null) {
    const f = this.data.folders.find((x) => x.id === id);
    if (!f) return;
    if (parentId && folderDescendants(this.data.folders, id).has(parentId)) return;
    if (parentId === id) return;
    await this.putFolderState({ ...f, parentId, updatedAt: Date.now() });
  }

  /** フォルダを削除。中の記録とフォルダは消さず、1つ上の階層へ移す */
  async deleteFolder(id: ID) {
    const f = this.data.folders.find((x) => x.id === id);
    if (!f) return;
    const up = f.parentId;
    const now = Date.now();
    const entries = this.data.entries.filter((e) => e.folderId === id).map((e) => ({ ...e, folderId: up, updatedAt: now }));
    const kids = this.data.folders.filter((x) => x.parentId === id).map((x) => ({ ...x, parentId: up, updatedAt: now }));
    const people = this.data.people.filter((x) => x.folderId === id).map((x) => ({ ...x, folderId: up, updatedAt: now }));
    const topics = this.data.topics.filter((x) => x.folderId === id).map((x) => ({ ...x, folderId: up, updatedAt: now }));
    for (const x of people) await this.repo.putPerson(x);
    for (const x of topics) await this.repo.putTopic(x);
    for (const e of entries) await this.repo.putEntry(e);
    for (const k of kids) await this.repo.putFolder(k);
    await this.repo.deleteFolder(id);
    const em = new Map(entries.map((e) => [e.id, e]));
    const fm = new Map(kids.map((k) => [k.id, k]));
    this.set({
      ...this.data,
      folders: this.data.folders.filter((x) => x.id !== id).map((x) => fm.get(x.id) ?? x),
      entries: this.data.entries.map((e) => em.get(e.id) ?? e),
      people: this.data.people.map((x) => people.find((y) => y.id === x.id) ?? x),
      topics: this.data.topics.map((x) => topics.find((y) => y.id === x.id) ?? x),
    });
  }

  /** 開いた日時を残す(「最後に見た順」用)。更新日時は変えない */
  async markViewed(kind: 'entry' | 'person' | 'topic' | 'folder', id: ID) {
    const now = Date.now();
    if (kind === 'folder') {
      const f = this.data.folders.find((x) => x.id === id);
      if (!f) return;
      const next = { ...f, viewedAt: now };
      await this.repo.putFolder(next);
      this.set({ ...this.data, folders: this.data.folders.map((x) => (x.id === id ? next : x)) });
      return;
    }
    if (kind === 'entry') {
      const e = this.data.entries.find((x) => x.id === id);
      if (!e) return;
      const next = { ...e, viewedAt: now };
      await this.repo.putEntry(next);
      this.set({ ...this.data, entries: this.data.entries.map((x) => (x.id === id ? next : x)) });
    } else if (kind === 'person') {
      const p = this.data.people.find((x) => x.id === id);
      if (!p) return;
      const next = { ...p, viewedAt: now };
      await this.repo.putPerson(next);
      this.set({ ...this.data, people: this.data.people.map((x) => (x.id === id ? next : x)) });
    } else {
      const t = this.data.topics.find((x) => x.id === id);
      if (!t) return;
      const next = { ...t, viewedAt: now };
      await this.repo.putTopic(next);
      this.set({ ...this.data, topics: this.data.topics.map((x) => (x.id === id ? next : x)) });
    }
  }

  /** 記録の編集で人・話題を選んだ日時を残す(ドロップダウンの並び順用) */
  async markSelected(kind: 'person' | 'topic', id: ID) {
    const now = Date.now();
    if (kind === 'person') {
      const p = this.data.people.find((x) => x.id === id);
      if (!p) return;
      const next = { ...p, selectedAt: now };
      await this.repo.putPerson(next);
      this.set({ ...this.data, people: this.data.people.map((x) => (x.id === id ? next : x)) });
    } else {
      const t = this.data.topics.find((x) => x.id === id);
      if (!t) return;
      const next = { ...t, selectedAt: now };
      await this.repo.putTopic(next);
      this.set({ ...this.data, topics: this.data.topics.map((x) => (x.id === id ? next : x)) });
    }
  }

  // ---- バックアップ ----
  async importData(incoming: AppData, mode: 'merge' | 'replace') {
    const next = mode === 'merge' ? mergeData(this.data, incoming) : incoming;
    await this.repo.replaceAll(next);
    this.set(next);
  }
}

/** あるフォルダの子孫フォルダ全部(自分は含まない) */
export function folderDescendants(folders: Folder[], id: ID): Set<ID> {
  const out = new Set<ID>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const f of folders) if (f.parentId === cur && !out.has(f.id)) { out.add(f.id); stack.push(f.id); }
  }
  return out;
}

/** 「仕事 / 会議」のようなフォルダのパス */
export function folderPath(folders: Folder[], id: ID | null): Folder[] {
  const path: Folder[] = [];
  const seen = new Set<ID>();
  let cur = id ? folders.find((f) => f.id === id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined;
  }
  return path;
}

export const folderScope = (f: Folder): FolderScope => f.scope ?? 'entry';
export const foldersOf = (folders: Folder[], scope: FolderScope) => folders.filter((f) => folderScope(f) === scope);
