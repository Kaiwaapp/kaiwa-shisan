import type { ImportDraft } from './importers';
import type { Repository } from './repository';
import { applyIncremental, mergeData, type ParsedBackup } from './backup';
import { entryHasPerson, newId, type AppData, type Entry, type EntryImage, type Folder, type FolderScope, type Group, type ID, type Person, type ScheduleEvent, type Todo, type Topic, mergeProfiles } from './types';
import { normalize, reorderValues } from './search';
import { buildSamples } from './samples';

type Listener = () => void;

type NewEntryName = string | { name: string; reading?: string };

export interface EntryInput {
  /** タイトル(任意)。空なら付けない */
  title?: string;
  text: string;
  /** メモ(任意)。未指定なら今のまま、空なら消す */
  memo?: string;
  personIds: ID[];
  /** 話したグループ(グループ自体を付ける) */
  groupIds?: ID[];
  topicIds: ID[];
  /** 保存時に新しく作る人・タグの名前。人は同名の人がいても別の人として作る */
  newPeople?: NewEntryName[];
  newTopics?: NewEntryName[];
  /** AIの提案から付けたタグ(既存のid・新規の名前)。source を 'ai' にする */
  aiTopicIds?: ID[];
  aiNewTopics?: string[];
  talkedOn: string;
  folderId?: ID | null;
  /** お気に入り。未指定なら今の状態のまま */
  favorite?: boolean;
  /** 添付画像の id(並び順どおり)。未指定なら今のまま。外した画像は保存時に消す */
  imageIds?: ID[];
  /** 今回新しく添付した画像(imageIds に入っているものだけ保存する) */
  newImages?: EntryImage[];
}

export interface EventInput {
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  personIds: ID[];
  groupIds?: ID[];
  /** 保存時に新しく作る人の名前 */
  newPeople?: string[];
  place?: string;
  memo?: string;
  alarm?: ScheduleEvent['alarm'];
}

export interface ImportResult { entryIds: ID[]; personIds: ID[]; topicIds: ID[]; folderIds: ID[] }

/** アプリの状態と操作。React非依存なのでネイティブ版でも使い回せる */
export class Store {
  /** 削除済み(ゴミ箱)の話題も含む全データ */
  private data: AppData = { people: [], topics: [], entries: [], folders: [], groups: [] };
  /** 画面に出すデータ(削除済みの話題を除く) */
  private snap: AppData = this.data;
  private trashSnap: Entry[] = [];
  private listeners = new Set<Listener>();
  /** 端末のデータを読み終えたか。読み終えるまで画面は「読み込み中」にする */
  loaded = false;
  /** 読み込みに失敗したとき true(画面から再試行できる) */
  loadFailed = false;
  private loading: Promise<void> | null = null;

  /** 新しく作る人・タグの読み仮名を名前から推測する(画面側が入力から拾ったもの) */
  readingGuess: ((name: string, kind: 'person' | 'topic') => string) | null = null;

  constructor(private repo: Repository) {}

  /**
   * 端末のデータを読み込む。iOSでは起動直後の読み込みが失敗することがあるので数回やり直す。
   * 読み終えるまで loaded を true にしない(空の一覧が出たり、空の内容で編集画面が始まったりしないように)
   */
  init(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.loading ??= this.load().finally(() => { this.loading = null; });
    return this.loading;
  }

  private async load(retries = 3) {
    if (this.loadFailed) { this.loadFailed = false; this.emit(); }
    for (let i = 0; ; i++) {
      try {
        const data = await this.repo.loadAll();
        this.loaded = true;
        this.set(data);
        break;
      } catch (e) {
        if (i >= retries) {
          console.error('データの読み込みに失敗しました', e);
          this.loadFailed = true;
          this.emit();
          return;
        }
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
    await this.purgeTrash().catch(() => {});
    // 保存の途中でアプリが閉じられた等で残った、どの話題にも付いていない画像を消す
    await this.gcImages().catch(() => {});
  }

  get snapshot(): AppData { return this.snap; }
  /** 最近削除した項目(新しく消した順) */
  get trash(): Entry[] { return this.trashSnap; }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };

  private emit() { for (const l of this.listeners) l(); }

  private set(next: AppData) {
    if (!next.groups) next = { ...next, groups: [] };
    if (!next.events) next = { ...next, events: [] };
    if (!next.todos) next = { ...next, todos: [] };
    this.data = next;
    const live: Entry[] = [];
    const dead: Entry[] = [];
    for (const e of next.entries) (e.deletedAt ? dead : live).push(e);
    this.snap = { ...next, entries: live };
    this.trashSnap = dead.sort((a, b) => b.deletedAt! - a.deletedAt!);
    this.emit();
  }

  private async putEntries(list: Entry[]) {
    for (const e of list) await this.repo.putEntry(e);
    const m = new Map(list.map((e) => [e.id, e]));
    this.set({ ...this.data, entries: this.data.entries.map((e) => m.get(e.id) ?? e) });
  }

  // ---- 話題 ----
  async saveEntry(input: EntryInput, id?: ID): Promise<Entry> {
    const now = Date.now();
    const prev = id ? this.data.entries.find((e) => e.id === id) : undefined;
    const prevSource = new Map(prev?.topics.map((t) => [t.topicId, t.source]));
    // 新規の人・タグは話題の保存時にはじめて作る(キャンセルしたらゴミが残らない)
    const personIds = [...input.personIds];
    for (const item of input.newPeople ?? []) {
      const { name, reading } = typeof item === 'string' ? { name: item } : item;
      if (name.trim()) personIds.push((await this.addPerson(name, null, [], true, reading)).id);
    }
    const alive = new Set(this.data.groups.map((g) => g.id));
    const groupIds = [...new Set(input.groupIds ?? prev?.groupIds ?? [])].filter((g) => alive.has(g));
    const topicIds = [...input.topicIds];
    const aiIds = new Set(input.aiTopicIds ?? []);
    const aiNew = new Set((input.aiNewTopics ?? []).map((n) => normalize(n.trim())));
    for (const item of input.newTopics ?? []) {
      const { name, reading } = typeof item === 'string' ? { name: item } : item;
      if (!name.trim()) continue;
      const t = await this.addTopic(name, null, reading);
      topicIds.push(t.id);
      if (aiNew.has(normalize(name.trim()))) aiIds.add(t.id);
    }
    const entry: Entry = {
      id: prev?.id ?? newId(),
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      text: input.text.trim(),
      ...((input.memo ?? prev?.memo ?? '').trim() ? { memo: (input.memo ?? prev?.memo ?? '').trim() } : {}),
      personIds: [...new Set(personIds)],
      ...(groupIds.length ? { groupIds } : {}),
      ...(groupIds.length && prev?.excludedPersonIds?.length
        ? { excludedPersonIds: prev.excludedPersonIds.filter((p) => !personIds.includes(p)) } : {}),
      folderId: input.folderId === undefined ? (prev?.folderId ?? null) : input.folderId,
      topics: [...new Set(topicIds)].map((topicId) => ({
        topicId,
        source: prevSource.get(topicId) ?? (aiIds.has(topicId) ? 'ai' : 'manual'),
      })),
      talkedOn: input.talkedOn,
      // 編集してもピン留め・お気に入りは外さない
      ...(prev?.pinned ? { pinned: true } : {}),
      ...((input.favorite ?? prev?.favorite) ? { favorite: true } : {}),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      viewedAt: now,
    };
    const imageIds = input.imageIds ?? prev?.imageIds ?? [];
    if (imageIds.length) entry.imageIds = [...new Set(imageIds)];
    // 画像を先に保存してから話題を保存する(途中で閉じても話題が画像を見失わない)
    for (const img of input.newImages ?? []) if (imageIds.includes(img.id)) await this.repo.putImage(img);
    await this.repo.putEntry(entry);
    for (const old of prev?.imageIds ?? []) if (!imageIds.includes(old)) await this.repo.deleteImage(old).catch(() => {});
    this.set({
      ...this.data,
      entries: prev
        ? this.data.entries.map((e) => (e.id === entry.id ? entry : e))
        : [...this.data.entries, entry],
    });
    return entry;
  }

  async unlinkEntry(entryId: ID, link: { kind: 'person' | 'topic'; id: ID }): Promise<boolean> {
    const entry = this.data.entries.find((e) => e.id === entryId && !e.deletedAt);
    if (!entry) return false;
    const updated: Entry = { ...entry, updatedAt: Date.now() };
    delete updated.sample;
    if (link.kind === 'topic') {
      updated.topics = entry.topics.filter((tag) => tag.topicId !== link.id);
      if (updated.topics.length === entry.topics.length) return false;
    } else {
      const person = this.data.people.find((p) => p.id === link.id);
      if (!person || !entryHasPerson(entry, person)) return false;
      updated.personIds = entry.personIds.filter((id) => id !== person.id);
      if (entry.groupIds?.some((id) => person.groupIds?.includes(id))) {
        updated.excludedPersonIds = [...new Set([...(entry.excludedPersonIds ?? []), person.id])];
      }
    }
    await this.putEntries([updated]);
    return true;
  }

  /** 話題を「最近削除した項目」へ移す(30日間は復元できる) */
  async deleteEntry(id: ID) { await this.trashEntries([id]); }

  async trashEntries(ids: ID[]) {
    const now = Date.now();
    const set = new Set(ids);
    await this.putEntries(this.data.entries.filter((e) => set.has(e.id)).map((e) => ({ ...e, deletedAt: now, pinned: false })));
  }

  async restoreEntries(ids: ID[]) {
    const set = new Set(ids);
    // 元のフォルダが消えていたら一番上へ
    const alive = new Set(this.data.folders.map((f) => f.id));
    await this.putEntries(
      this.data.entries
        .filter((e) => set.has(e.id))
        .map((e) => ({ ...e, deletedAt: undefined, folderId: e.folderId && alive.has(e.folderId) ? e.folderId : null })),
    );
  }

  /** フォルダに入っている話題(削除済みは除く)。deep なら中のフォルダの話題も含める */
  folderEntryIds(folderId: ID, deep: boolean): ID[] {
    const scope = new Set([folderId, ...(deep ? folderDescendants(this.data.folders, folderId) : [])]);
    return this.snap.entries.filter((e) => e.folderId && scope.has(e.folderId)).map((e) => e.id);
  }

  /** フォルダ内の話題をまとめて「最近削除した項目」へ移す。フォルダ自体は残す。移した件数を返す */
  async trashFolderEntries(folderId: ID, deep: boolean): Promise<number> {
    const ids = this.folderEntryIds(folderId, deep);
    if (ids.length) await this.trashEntries(ids);
    return ids.length;
  }

  /** 完全に削除 */
  async purgeEntries(ids: ID[]) {
    const set = new Set(ids);
    for (const id of ids) {
      for (const img of this.data.entries.find((e) => e.id === id)?.imageIds ?? []) await this.repo.deleteImage(img).catch(() => {});
      await this.repo.deleteEntry(id);
    }
    this.set({ ...this.data, entries: this.data.entries.filter((e) => !set.has(e.id)) });
  }

  /** 削除から30日たった話題を完全に消す */
  async purgeTrash(days = 30) {
    const limit = Date.now() - days * 24 * 3600 * 1000;
    const old = this.data.entries.filter((e) => e.deletedAt && e.deletedAt < limit).map((e) => e.id);
    if (old.length) await this.purgeEntries(old);
  }

  // ---- ピン留め・まとめて移動 ----
  async setPinned(kind: 'entry' | 'person' | 'topic', ids: ID[], pinned: boolean) {
    await this.setFlag(kind, ids, { pinned });
  }

  /** お気に入りに入れる・外す */
  async setFavorite(kind: 'entry' | 'person' | 'topic', ids: ID[], favorite: boolean) {
    await this.setFlag(kind, ids, { favorite });
  }

  private async setFlag(kind: 'entry' | 'person' | 'topic', ids: ID[], patch: { pinned?: boolean; favorite?: boolean }) {
    const set = new Set(ids);
    if (kind === 'entry') {
      await this.putEntries(this.data.entries.filter((e) => set.has(e.id)).map((e) => ({ ...e, ...patch })));
    } else if (kind === 'person') {
      const list = this.data.people.filter((p) => set.has(p.id)).map((p) => ({ ...p, ...patch }));
      for (const x of list) await this.repo.putPerson(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, people: this.data.people.map((x) => m.get(x.id) ?? x) });
    } else {
      const list = this.data.topics.filter((t) => set.has(t.id)).map((t) => ({ ...t, ...patch }));
      for (const x of list) await this.repo.putTopic(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, topics: this.data.topics.map((x) => m.get(x.id) ?? x) });
    }
  }

  /**
   * 手動の並び順を変える。arranged は並べ替えた後の一覧(その画面に出ている順)。
   * 並び順は編集ではないので更新日時は変えない
   */
  async reorder(kind: 'entry' | 'person' | 'topic' | 'folder', arranged: ID[]) {
    const pool: { id: ID; createdAt: number; order?: number }[] =
      kind === 'entry' ? this.data.entries : kind === 'person' ? this.data.people : kind === 'topic' ? this.data.topics : this.data.folders;
    const values = reorderValues(pool, arranged);
    const apply = <T extends { id: ID; order?: number }>(xs: T[]) => xs.filter((x) => values.has(x.id) && x.order !== values.get(x.id)).map((x) => ({ ...x, order: values.get(x.id)! }));
    if (kind === 'entry') {
      await this.putEntries(apply(this.data.entries));
    } else if (kind === 'person') {
      const list = apply(this.data.people);
      for (const x of list) await this.repo.putPerson(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, people: this.data.people.map((x) => m.get(x.id) ?? x) });
    } else if (kind === 'topic') {
      const list = apply(this.data.topics);
      for (const x of list) await this.repo.putTopic(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, topics: this.data.topics.map((x) => m.get(x.id) ?? x) });
    } else {
      const list = apply(this.data.folders);
      for (const x of list) await this.repo.putFolder(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, folders: this.data.folders.map((x) => m.get(x.id) ?? x) });
    }
  }

  /** 話題・人・タグ・フォルダをまとめて別のフォルダへ移す(null は一番上) */
  async moveItems(kind: 'entry' | 'person' | 'topic' | 'folder', ids: ID[], folderId: ID | null) {
    const set = new Set(ids);
    const now = Date.now();
    if (kind === 'folder') {
      for (const id of ids) await this.moveFolder(id, folderId);
      return;
    }
    if (kind === 'entry') {
      await this.putEntries(this.data.entries.filter((e) => set.has(e.id)).map((e) => ({ ...e, folderId, updatedAt: now })));
    } else if (kind === 'person') {
      const list = this.data.people.filter((p) => set.has(p.id)).map((p) => ({ ...p, folderId, updatedAt: now }));
      for (const x of list) await this.repo.putPerson(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, people: this.data.people.map((x) => m.get(x.id) ?? x) });
    } else {
      const list = this.data.topics.filter((t) => set.has(t.id)).map((t) => ({ ...t, folderId, updatedAt: now }));
      for (const x of list) await this.repo.putTopic(x);
      const m = new Map(list.map((x) => [x.id, x]));
      this.set({ ...this.data, topics: this.data.topics.map((x) => m.get(x.id) ?? x) });
    }
  }

  // ---- 人 ----
  findPersonByName(name: string) {
    const n = normalize(name.trim());
    return this.data.people.find((p) => normalize(p.name) === n);
  }

  /** 人を追加。同名の人がいればその人を返す。allowSame なら同名でも別の人として作る */
  async addPerson(name: string, folderId: ID | null = null, groupIds: ID[] = [], allowSame = false, manualReading?: string): Promise<Person> {
    const existing = allowSame ? undefined : this.findPersonByName(name);
    if (existing) return existing;
    const now = Date.now();
    const reading = (manualReading?.trim() ?? this.readingGuess?.(name.trim(), 'person')) || undefined;
    const p: Person = { id: newId(), name: name.trim(), memo: '', ...(reading ? { reading } : {}), folderId, ...(groupIds.length ? { groupIds } : {}), createdAt: now, updatedAt: now, selectedAt: now };
    await this.repo.putPerson(p);
    this.set({ ...this.data, people: [...this.data.people, p] });
    return p;
  }

  async updatePerson(id: ID, patch: Partial<Pick<Person, 'name' | 'memo' | 'reading' | 'folderId' | 'groupIds' | 'profile' | 'relation'>>) {
    const p = this.data.people.find((x) => x.id === id);
    if (!p) return;
    const next = { ...p, ...patch, sample: undefined, updatedAt: Date.now() };
    await this.repo.putPerson(next);
    this.set({ ...this.data, people: this.data.people.map((x) => (x.id === id ? next : x)) });
  }

  /** 人を削除。話題自体は残し、その人の紐づけだけ外す */
  async deletePerson(id: ID) {
    const now = Date.now();
    const touched = this.data.entries
      .filter((e) => e.personIds.includes(id) || e.excludedPersonIds?.includes(id))
      .map((e) => ({ ...e, personIds: e.personIds.filter((x) => x !== id), excludedPersonIds: e.excludedPersonIds?.filter((x) => x !== id), updatedAt: now }));
    for (const e of touched) await this.repo.putEntry(e);
    const { events, todos } = await this.fixEvents((e) => (e.personIds.includes(id) ? { ...e, personIds: e.personIds.filter((x) => x !== id), updatedAt: now } : null));
    await this.repo.deletePerson(id);
    const map = new Map(touched.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      people: this.data.people.filter((p) => p.id !== id),
      entries: this.data.entries.map((e) => map.get(e.id) ?? e),
      events,
      todos,
    });
  }

  // ---- 予定 ----
  async saveEvent(input: EventInput, id?: ID): Promise<ScheduleEvent> {
    const now = Date.now();
    const prev = id ? this.data.events!.find((e) => e.id === id) : undefined;
    const personIds = [...input.personIds];
    for (const name of input.newPeople ?? []) if (name.trim()) personIds.push((await this.addPerson(name, null, [], true)).id);
    const alive = new Set(this.data.groups.map((g) => g.id));
    const groupIds = [...new Set(input.groupIds ?? [])].filter((g) => alive.has(g));
    const time = input.time || undefined;
    const ev: ScheduleEvent = {
      id: prev?.id ?? newId(),
      title: input.title.trim(),
      date: input.date,
      ...(time ? { time } : {}),
      ...(time && input.endTime && input.endTime > time ? { endTime: input.endTime } : {}),
      personIds: [...new Set(personIds)],
      ...(groupIds.length ? { groupIds } : {}),
      ...(input.place?.trim() ? { place: input.place.trim() } : {}),
      ...(input.memo?.trim() ? { memo: input.memo.trim() } : {}),
      ...(input.alarm ? { alarm: input.alarm } : {}),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putEvent(ev);
    const rest = this.data.events!.filter((e) => e.id !== ev.id);
    this.set({ ...this.data, events: [...rest, ev] });
    return ev;
  }

  async deleteEvent(id: ID) {
    await this.repo.deleteEvent(id);
    this.set({ ...this.data, events: this.data.events!.filter((e) => e.id !== id) });
  }

  /** 人・グループを消したり、まとめたりしたときに予定・ToDoの紐づけを直す */
  private async fixEvents(fn: <T extends ScheduleEvent | Todo>(e: T) => T | null): Promise<{ events: ScheduleEvent[]; todos: Todo[] }> {
    const events: ScheduleEvent[] = [];
    for (const e of this.data.events ?? []) {
      const n = fn(e);
      if (n) { await this.repo.putEvent(n); events.push(n); } else events.push(e);
    }
    const todos: Todo[] = [];
    for (const x of this.data.todos ?? []) {
      const n = fn(x);
      if (n) { await this.repo.putTodo(n); todos.push(n); } else todos.push(x);
    }
    return { events, todos };
  }

  // ---- ToDo ----
  async saveTodo(input: { text: string; genre?: string; start?: string; due?: string; personIds: ID[]; groupIds?: ID[]; newPeople?: string[] }, id?: ID): Promise<Todo> {
    const now = Date.now();
    const prev = id ? this.data.todos!.find((x) => x.id === id) : undefined;
    const personIds = [...input.personIds];
    for (const name of input.newPeople ?? []) if (name.trim()) personIds.push((await this.addPerson(name, null, [], true)).id);
    const alive = new Set(this.data.groups.map((g) => g.id));
    const groupIds = [...new Set(input.groupIds ?? [])].filter((g) => alive.has(g));
    const genre = input.genre?.trim() ?? prev?.genre;
    const td: Todo = {
      id: prev?.id ?? newId(),
      text: input.text.trim(),
      ...(genre ? { genre } : {}),
      done: prev?.done ?? false,
      ...(prev?.doneAt ? { doneAt: prev.doneAt } : {}),
      ...(input.start ? { start: input.start } : {}),
      ...(input.due ? { due: input.due } : {}),
      personIds: [...new Set(personIds)],
      ...(groupIds.length ? { groupIds } : {}),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.putTodo(td);
    this.set({ ...this.data, todos: [...this.data.todos!.filter((x) => x.id !== td.id), td] });
    return td;
  }

  async setTodoDone(id: ID, done: boolean) {
    const prev = this.data.todos!.find((x) => x.id === id);
    if (!prev) return;
    const now = Date.now();
    const { doneAt: _, ...rest } = prev;
    const next: Todo = { ...rest, done, ...(done ? { doneAt: now } : {}), updatedAt: now };
    await this.repo.putTodo(next);
    this.set({ ...this.data, todos: this.data.todos!.map((x) => (x.id === id ? next : x)) });
  }

  async deleteTodos(ids: ID[]) {
    for (const id of ids) await this.repo.deleteTodo(id);
    const s = new Set(ids);
    this.set({ ...this.data, todos: this.data.todos!.filter((x) => !s.has(x.id)) });
  }

  // ---- 人のグループ(1人が複数に入れる) ----
  findGroupByName(name: string) {
    const n = normalize(name.trim());
    return this.data.groups.find((g) => normalize(g.name) === n);
  }

  async addGroup(name: string): Promise<Group> {
    const existing = this.findGroupByName(name);
    if (existing) return existing;
    const now = Date.now();
    const g: Group = { id: newId(), name: name.trim(), createdAt: now, updatedAt: now };
    await this.repo.putGroup(g);
    this.set({ ...this.data, groups: [...this.data.groups, g] });
    return g;
  }

  async renameGroup(id: ID, name: string) {
    const g = this.data.groups.find((x) => x.id === id);
    if (!g || !name.trim()) return;
    const next = { ...g, name: name.trim(), updatedAt: Date.now() };
    await this.repo.putGroup(next);
    this.set({ ...this.data, groups: this.data.groups.map((x) => (x.id === id ? next : x)) });
  }

  /** グループを削除。人や話題は消さず、グループへの紐づけだけ外す */
  async deleteGroup(id: ID) {
    const now = Date.now();
    const touched = this.data.people
      .filter((p) => p.groupIds?.includes(id))
      .map((p) => ({ ...p, groupIds: p.groupIds!.filter((x) => x !== id), updatedAt: now }));
    for (const p of touched) await this.repo.putPerson(p);
    const touchedE = this.data.entries
      .filter((e) => e.groupIds?.includes(id))
      .map((e) => {
        const groupIds = e.groupIds!.filter((x) => x !== id);
        const { groupIds: _, ...rest } = e;
        return { ...rest, ...(groupIds.length ? { groupIds } : {}) } as Entry;
      });
    for (const e of touchedE) await this.repo.putEntry(e);
    const { events, todos } = await this.fixEvents((e) => {
      if (!e.groupIds?.includes(id)) return null;
      const { groupIds: g, ...rest } = e;
      const left = g!.filter((x) => x !== id);
      return { ...rest, ...(left.length ? { groupIds: left } : {}), updatedAt: now } as unknown as typeof e;
    });
    await this.repo.deleteGroup(id);
    const m = new Map(touched.map((p) => [p.id, p]));
    const me = new Map(touchedE.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      groups: this.data.groups.filter((g) => g.id !== id),
      people: this.data.people.map((p) => m.get(p.id) ?? p),
      entries: this.data.entries.map((e) => me.get(e.id) ?? e),
      events,
      todos,
    });
  }

  /** 人をまとめてグループに入れる・外す */
  async setGroupMembers(groupId: ID, personIds: ID[], member: boolean) {
    const set = new Set(personIds);
    const now = Date.now();
    const list = this.data.people
      .filter((p) => set.has(p.id) && (p.groupIds?.includes(groupId) ?? false) !== member)
      .map((p) => ({
        ...p,
        groupIds: member ? [...(p.groupIds ?? []), groupId] : (p.groupIds ?? []).filter((x) => x !== groupId),
        updatedAt: now,
      }));
    for (const x of list) await this.repo.putPerson(x);
    const m = new Map(list.map((x) => [x.id, x]));
    this.set({ ...this.data, people: this.data.people.map((x) => m.get(x.id) ?? x) });
  }

  // ---- タグ ----
  findTopicByName(name: string) {
    const n = normalize(name.trim().replace(/^#/, ''));
    return this.data.topics.find((t) => normalize(t.name) === n);
  }

  async addTopic(name: string, folderId: ID | null = null, manualReading?: string): Promise<Topic> {
    const existing = this.findTopicByName(name);
    if (existing) return existing;
    const now = Date.now();
    const tr = (manualReading?.trim() ?? this.readingGuess?.(name.trim().replace(/^#/, ''), 'topic')) || undefined;
    const t: Topic = { id: newId(), name: name.trim().replace(/^#/, ''), ...(tr ? { reading: tr } : {}), folderId, createdAt: now, updatedAt: now, selectedAt: now };
    await this.repo.putTopic(t);
    this.set({ ...this.data, topics: [...this.data.topics, t] });
    return t;
  }

  /** タグをまとめて登録する(用意したタグリストから)。同じ名前のタグがあるものは登録しない。登録した件数を返す */
  async addTopicsBulk(items: { name: string; reading?: string }[], folderId: ID | null = null): Promise<number> {
    const now = Date.now();
    const seen = new Set(this.data.topics.map((t) => normalize(t.name)));
    const added: Topic[] = [];
    for (const it of items) {
      const name = it.name.trim().replace(/^#/, '');
      if (!name || seen.has(normalize(name))) continue;
      seen.add(normalize(name));
      const t: Topic = { id: newId(), name, ...(it.reading ? { reading: it.reading } : {}), folderId, createdAt: now, updatedAt: now };
      await this.repo.putTopic(t);
      added.push(t);
    }
    if (added.length) this.set({ ...this.data, topics: [...this.data.topics, ...added] });
    return added.length;
  }

  async updateTopic(id: ID, patch: Partial<Pick<Topic, 'name' | 'reading' | 'folderId'>>) {
    const t = this.data.topics.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, ...patch, sample: undefined, updatedAt: Date.now() };
    await this.repo.putTopic(next);
    this.set({ ...this.data, topics: this.data.topics.map((x) => (x.id === id ? next : x)) });
  }

  async renameTopic(id: ID, name: string, reading?: string) {
    const t = this.data.topics.find((x) => x.id === id);
    if (!t) return;
    const next = { ...t, name: name.trim(), reading: reading ?? t.reading, sample: undefined, updatedAt: Date.now() };
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

  /** source の人を target に統合。話題の紐づけを付け替え、メモを足して source を消す */
  async mergePeople(sourceId: ID, targetId: ID) {
    if (sourceId === targetId) return;
    const src = this.data.people.find((p) => p.id === sourceId);
    const dst = this.data.people.find((p) => p.id === targetId);
    if (!src || !dst) return;
    const now = Date.now();
    const touched = this.data.entries
      .filter((e) => e.personIds.includes(sourceId) || e.excludedPersonIds?.includes(sourceId))
      .map((e) => ({
        ...e,
        personIds: [...new Set(e.personIds.map((x) => (x === sourceId ? targetId : x)))],
        excludedPersonIds: e.excludedPersonIds?.filter((x) => x !== sourceId),
        updatedAt: now,
      }));
    for (const e of touched) await this.repo.putEntry(e);
    const memo = [dst.memo, src.memo].filter((m) => m.trim()).join('\n');
    const groupIds = [...new Set([...(dst.groupIds ?? []), ...(src.groupIds ?? [])])];
    const profile = mergeProfiles(dst.profile, src.profile);
    const merged: Person = { ...dst, relation: dst.relation ?? src.relation, memo, ...(groupIds.length ? { groupIds } : {}), profile, updatedAt: now };
    if (!profile) delete merged.profile;
    const { events, todos } = await this.fixEvents((e) => (e.personIds.includes(sourceId) ? { ...e, personIds: [...new Set(e.personIds.map((x) => (x === sourceId ? targetId : x)))], updatedAt: now } : null));
    if (!merged.relation) delete merged.relation;
    await this.repo.putPerson(merged);
    await this.repo.deletePerson(sourceId);
    const map = new Map(touched.map((e) => [e.id, e]));
    this.set({
      ...this.data,
      people: this.data.people.filter((p) => p.id !== sourceId).map((p) => (p.id === targetId ? merged : p)),
      entries: this.data.entries.map((e) => map.get(e.id) ?? e),
      events,
      todos,
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
          // 同じタグが重なったら手動タグを優先して1つに
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

  /** フォルダを削除。中の話題とフォルダは消さず、1つ上の階層へ移す */
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
    try {
      await this.recordView(kind, id);
    } catch (error) {
      // 閲覧日時は並べ替え用。記録に失敗しても表示中の画面には影響させない。
      console.warn('Could not record the last viewed time', error);
    }
  }

  private async recordView(kind: 'entry' | 'person' | 'topic' | 'folder', id: ID) {
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

  /** 話題の編集で人・タグを選んだ日時を残す(ドロップダウンの並び順用) */
  async markSelected(kind: 'person' | 'topic' | 'group', id: ID) {
    const now = Date.now();
    if (kind === 'group') {
      const g = this.data.groups.find((x) => x.id === id);
      if (!g) return;
      const next = { ...g, selectedAt: now };
      await this.repo.putGroup(next);
      this.set({ ...this.data, groups: this.data.groups.map((x) => (x.id === id ? next : x)) });
    } else if (kind === 'person') {
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

  // ---- 他アプリからの取り込み ----
  /**
   * 下書きをまとめて話題にする。人・タグは名前で既存のものに合わせ、なければ作る。
   * 取り消し用に、新しく作ったもののIDを返す。
   */
  async importDrafts(
    drafts: (Omit<ImportDraft, 'key' | 'include'> & { aiTopics?: boolean })[],
    folder: { id: ID | null } | { newName: string; parentId: ID | null },
  ): Promise<ImportResult> {
    const now = Date.now();
    const people = new Map(this.data.people.map((p) => [normalize(p.name), p]));
    const topics = new Map(this.data.topics.map((t) => [normalize(t.name), t]));
    const created: ImportResult = { entryIds: [], personIds: [], topicIds: [], folderIds: [] };
    const incoming: AppData = { people: [], topics: [], entries: [], folders: [], groups: [] };
    let folderId: ID | null;
    if ('newName' in folder) {
      const f: Folder = { id: newId(), name: folder.newName.trim() || '取り込み', parentId: folder.parentId, scope: 'entry', createdAt: now, updatedAt: now };
      incoming.folders.push(f);
      created.folderIds.push(f.id);
      folderId = f.id;
    } else folderId = folder.id;
    const namesWithReadings = (kind: 'person' | 'topic') => {
      const readings = new Map<string, string>();
      for (const draft of drafts) {
        const names = kind === 'person' ? draft.people : draft.topics;
        const proposed = kind === 'person' ? draft.personReadings : draft.topicReadings;
        for (const name of names) {
          const key = normalize(name);
          const reading = proposed?.get(key);
          if (reading && !readings.has(key)) readings.set(key, reading);
        }
      }
      return readings;
    };
    const personReadings = namesWithReadings('person');
    const topicReadings = namesWithReadings('topic');
    const person = (name: string) => {
      const k = normalize(name.trim());
      let p = people.get(k);
      if (!p) {
        const reading = personReadings.get(k);
        p = { id: newId(), name: name.trim(), memo: '', ...(reading ? { reading } : {}), folderId: null, createdAt: now, updatedAt: now };
        people.set(k, p);
        incoming.people.push(p);
        created.personIds.push(p.id);
      }
      return p.id;
    };
    const topic = (name: string) => {
      const k = normalize(name.trim());
      let tp = topics.get(k);
      if (!tp) {
        const reading = topicReadings.get(k);
        tp = { id: newId(), name: name.trim(), ...(reading ? { reading } : {}), folderId: null, createdAt: now, updatedAt: now };
        topics.set(k, tp);
        incoming.topics.push(tp);
        created.topicIds.push(tp.id);
      }
      return tp.id;
    };
    drafts.forEach((d, i) => {
      const e: Entry = {
        id: newId(),
        ...(d.title.trim() ? { title: d.title.trim() } : {}),
        text: d.text.trim(),
        personIds: [...new Set(d.people.filter((n) => n.trim()).map(person))],
        topics: [...new Set(d.topics.filter((n) => n.trim()).map(topic))].map((topicId) => ({ topicId, source: d.aiTopics ? 'ai' : 'manual' })),
        talkedOn: d.talkedOn,
        folderId,
        // 並び順が取り込み順になるよう1msずつずらす
        createdAt: now + i,
        updatedAt: now + i,
      };
      incoming.entries.push(e);
      created.entryIds.push(e.id);
    });
    await this.importData(incoming, 'merge');
    return created;
  }

  /** 取り込みの取り消し。そのあと編集されたものも含めて、取り込みで作ったものを消す */
  async undoImport(r: ImportResult) {
    const drop = <T extends { id: ID }>(xs: T[], ids: ID[]) => { const s = new Set(ids); return xs.filter((x) => !s.has(x.id)); };
    await this.importData({
      people: drop(this.data.people, r.personIds),
      topics: drop(this.data.topics, r.topicIds),
      entries: drop(this.data.entries, r.entryIds),
      folders: drop(this.data.folders, r.folderIds),
      groups: this.data.groups,
      events: this.data.events,
      todos: this.data.todos,
    }, 'replace');
  }

  // ---- 添付画像 ----
  /** 画像を1枚読む(画面で表示するとき) */
  getImage(id: ID): Promise<EntryImage | undefined> { return this.repo.getImage(id); }

  /** 話題に付いている画像をまとめて読む(バックアップ用)。見つからないものは飛ばす */
  async imagesOf(entries: Entry[]): Promise<EntryImage[]> {
    const out: EntryImage[] = [];
    for (const id of new Set(entries.flatMap((e) => e.imageIds ?? []))) {
      const img = await this.repo.getImage(id);
      if (img) out.push(img);
    }
    return out;
  }

  /** どの話題(最近削除した項目も含む)にも付いていない画像を消す */
  async gcImages() {
    const used = new Set(this.data.entries.flatMap((e) => e.imageIds ?? []));
    for (const id of await this.repo.imageIds()) if (!used.has(id)) await this.repo.deleteImage(id);
  }

  // ---- 見本(初回に入れる話題・人・タグ) ----
  /** 何も入っていないか(最近削除した項目も含めて) */
  get isEmpty(): boolean {
    const d = this.data;
    return !d.entries.length && !d.people.length && !d.topics.length && !d.folders.length && !d.groups.length;
  }

  /** 見本が残っているか */
  get hasSamples(): boolean {
    const d = this.data;
    return d.entries.some((e) => e.sample) || d.people.some((p) => p.sample) || d.topics.some((t) => t.sample);
  }

  /** 見本を入れる。同じ名前の人・タグがすでにあれば、その人・タグは作らずに使う */
  async addSamples(now = Date.now()) {
    const s = buildSamples(now);
    const pid = new Map<ID, ID>();
    const tid = new Map<ID, ID>();
    const people: Person[] = [];
    const topics: Topic[] = [];
    for (const p of s.people) {
      const ex = this.data.people.find((x) => x.name === p.name);
      if (ex) pid.set(p.id, ex.id); else { pid.set(p.id, p.id); people.push(p); }
    }
    for (const t of s.topics) {
      const ex = this.findTopicByName(t.name);
      if (ex) tid.set(t.id, ex.id); else { tid.set(t.id, t.id); topics.push(t); }
    }
    const entries = s.entries.map((e) => ({
      ...e,
      personIds: e.personIds.map((x) => pid.get(x) ?? x),
      topics: e.topics.map((x) => ({ ...x, topicId: tid.get(x.topicId) ?? x.topicId })),
    }));
    for (const p of people) await this.repo.putPerson(p);
    for (const t of topics) await this.repo.putTopic(t);
    for (const e of entries) await this.repo.putEntry(e);
    this.set({ ...this.data, people: [...this.data.people, ...people], topics: [...this.data.topics, ...topics], entries: [...this.data.entries, ...entries] });
  }

  /**
   * 見本だけを消す。ユーザーが編集した話題は見本ではなくなっているので残る。
   * 見本の人・タグがユーザーの話題に使われていたら、消さずに普通の人・タグにする
   */
  async removeSamples() {
    const d = this.data;
    const kept = d.entries.filter((e) => !e.sample);
    const usedP = new Set(kept.flatMap((e) => e.personIds));
    const usedT = new Set(kept.flatMap((e) => e.topics.map((x) => x.topicId)));
    for (const e of d.entries) {
      if (!e.sample) continue;
      for (const img of e.imageIds ?? []) await this.repo.deleteImage(img).catch(() => {});
      await this.repo.deleteEntry(e.id);
    }
    const people: Person[] = [];
    for (const p of d.people) {
      if (!p.sample) { people.push(p); continue; }
      if (usedP.has(p.id)) { const n = { ...p, sample: undefined }; await this.repo.putPerson(n); people.push(n); }
      else await this.repo.deletePerson(p.id);
    }
    const topics: Topic[] = [];
    for (const t of d.topics) {
      if (!t.sample) { topics.push(t); continue; }
      if (usedT.has(t.id)) { const n = { ...t, sample: undefined }; await this.repo.putTopic(n); topics.push(n); }
      else await this.repo.deleteTopic(t.id);
    }
    this.set({ ...d, entries: kept, people, topics });
  }

  // ---- バックアップ ----
  /** 増分バックアップを反映する */
  async importIncremental(file: ParsedBackup) {
    const { images, ...rest } = file.data;
    for (const img of images ?? []) await this.repo.putImage(img);
    const next = applyIncremental(this.data, { ...file, data: rest });
    await this.repo.replaceAll(next);
    this.set(next);
  }

  async importData(incoming: AppData & { images?: EntryImage[] }, mode: 'merge' | 'replace') {
    const { images, ...rest } = incoming;
    const next = mode === 'merge' ? mergeData(this.data, rest) : rest;
    // 画像は話題より先に入れる
    for (const img of images ?? []) await this.repo.putImage(img);
    await this.repo.replaceAll(next);
    this.set(next);
    await this.gcImages().catch(() => {});
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
