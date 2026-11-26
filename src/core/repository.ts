import type { AppData, Entry, EntryImage, Folder, Group, Person, ScheduleEvent, Todo, Topic, ID } from './types';

/**
 * 保存先の抽象。Webは IndexedDB、将来のネイティブ版は SQLite 実装に差し替える。
 * 同期(課金機能)もこのインターフェースの裏側に足す想定。
 */
export interface Repository {
  loadAll(): Promise<AppData>;
  putPerson(p: Person): Promise<void>;
  deletePerson(id: ID): Promise<void>;
  putTopic(t: Topic): Promise<void>;
  deleteTopic(id: ID): Promise<void>;
  putEntry(e: Entry): Promise<void>;
  putFolder(f: Folder): Promise<void>;
  deleteFolder(id: ID): Promise<void>;
  putGroup(g: Group): Promise<void>;
  deleteGroup(id: ID): Promise<void>;
  deleteEntry(id: ID): Promise<void>;
  putEvent(e: ScheduleEvent): Promise<void>;
  deleteEvent(id: ID): Promise<void>;
  putTodo(t: Todo): Promise<void>;
  deleteTodo(id: ID): Promise<void>;
  /** 添付画像。loadAll では読まず、使うときに1枚ずつ読む */
  putImage(img: EntryImage): Promise<void>;
  getImage(id: ID): Promise<EntryImage | undefined>;
  deleteImage(id: ID): Promise<void>;
  /** 保存されている画像の id 一覧(いらない画像の掃除用) */
  imageIds(): Promise<ID[]>;
  /** 全データを置き換える(インポート用)。画像は対象外 */
  replaceAll(data: AppData): Promise<void>;
}
