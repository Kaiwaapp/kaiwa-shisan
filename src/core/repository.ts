import type { AppData, Entry, Folder, Person, Topic, ID } from './types';

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
  deleteEntry(id: ID): Promise<void>;
  /** 全データを置き換える(インポート用) */
  replaceAll(data: AppData): Promise<void>;
}
