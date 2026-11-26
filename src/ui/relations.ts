// 人の「関係」(友達・家族など)の選択肢。設定で名前の変更・並べ替え・追加・非表示ができる。
// プロフィールの項目と同じく端末ごとの表示設定として localStorage に置く。人には選択肢のIDを入れる。
import { useSyncExternalStore } from 'react';
import { newId } from '../core/types';
import { t } from '../i18n';

export interface RelationDef {
  id: string;
  /** 自分で付けた名前。初めからある選択肢で未設定なら既定の名前(翻訳あり)を使う */
  label?: string;
  /** 非表示(設定で「削除」したもの)。人に付けた関係は残る */
  hidden?: boolean;
}

/** 初めからある選択肢(表示時に t() を通す) */
export const BUILTIN_RELATIONS: Record<string, string> = {
  friend: '友達',
  family: '家族',
  partner: '恋人',
  work: '職場',
  acquaintance: '知人',
  other: 'その他',
};

export const relationLabel = (r: RelationDef) => r.label?.trim() || (BUILTIN_RELATIONS[r.id] ? t(BUILTIN_RELATIONS[r.id]) : '');

const KEY = 'kaiwa-shisan:relations';
const defaults = (): RelationDef[] => Object.keys(BUILTIN_RELATIONS).map((id) => ({ id }));

const load = (): RelationDef[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RelationDef[]) : null;
    return Array.isArray(list) && list.every((x) => typeof x?.id === 'string') ? list : defaults();
  } catch {
    return defaults();
  }
};

let current = load();
const listeners = new Set<() => void>();

const save = (next: RelationDef[]) => {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 保存できない環境では今回だけ反映 */ }
  listeners.forEach((f) => f());
};

export const getRelations = () => current;
export const visibleRelations = (list = current) => list.filter((r) => !r.hidden);
/** 人に付いている関係の名前。選択肢から消えたもの(IDが見つからない)は出さない */
export const relationName = (id: string | undefined, list = current) => {
  const r = id ? list.find((x) => x.id === id) : undefined;
  return r ? relationLabel(r) : '';
};

export const relationsApi = {
  rename(id: string, label: string) {
    const v = label.trim();
    const builtin = BUILTIN_RELATIONS[id];
    save(current.map((r) => {
      if (r.id !== id) return r;
      if (builtin) return { ...r, label: v && v !== t(builtin) ? v : undefined };
      return v ? { ...r, label: v } : r;
    }));
  },
  move(id: string, dir: -1 | 1) {
    const vis = visibleRelations();
    const i = vis.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const a = current.indexOf(vis[i]);
    const b = current.indexOf(vis[j]);
    const next = [...current];
    [next[a], next[b]] = [next[b], next[a]];
    save(next);
  },
  hide(id: string, hidden: boolean) {
    const r = current.find((x) => x.id === id);
    if (!r) return;
    const rest = current.filter((x) => x.id !== id);
    save(hidden ? current.map((x) => (x.id === id ? { ...x, hidden: true } : x)) : [...rest, { ...r, hidden: undefined }]);
  },
  add(label: string) {
    save([...current, { id: 'r_' + newId().slice(0, 8), label: label.trim() }]);
  },
  reset() {
    save([...defaults(), ...current.filter((r) => !BUILTIN_RELATIONS[r.id]).map((r) => ({ ...r, hidden: true }))]);
  },
};

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => { listeners.delete(f); };
};

export const useRelations = () => useSyncExternalStore(subscribe, getRelations);
