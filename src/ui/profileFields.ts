// プロフィールの項目(全員に共通のひな形)。設定で名前の変更・並べ替え・追加・非表示ができる。
// 端末ごとの表示設定として localStorage に置く。項目を消しても人のデータは消さず、非表示にするだけ。
import { useSyncExternalStore } from 'react';
import { PROFILE_KEYS, newId } from '../core/types';
import { t } from '../i18n';

export interface ProfileFieldDef {
  id: string;
  /** 自分で付けた名前。初めからある項目で未設定なら、下の既定の名前(翻訳あり)を使う */
  label?: string;
  /** 非表示(設定で「削除」したもの)。データは残る */
  hidden?: boolean;
}

/** 初めからある項目の名前と入力例(表示時に t() を通す) */
export const BUILTIN_FIELDS: Record<string, { label: string; placeholder: string }> = {
  age: { label: '年齢', placeholder: '例：28歳' },
  birthday: { label: '誕生日', placeholder: '例：3月14日' },
  area: { label: '住まい', placeholder: '例：東京・世田谷' },
  hometown: { label: '出身', placeholder: '例：福岡' },
  job: { label: '仕事', placeholder: '例：看護師' },
  hobbies: { label: '趣味', placeholder: '例：カフェ巡り、映画' },
  likes: { label: '好きなもの', placeholder: '例：パン、猫' },
  dislikes: { label: '苦手なもの', placeholder: '例：辛いもの' },
  metAt: { label: '知り合ったきっかけ', placeholder: '例：マッチングアプリ' },
};

export const fieldLabel = (f: ProfileFieldDef) => f.label?.trim() || (BUILTIN_FIELDS[f.id] ? t(BUILTIN_FIELDS[f.id].label) : '');
export const fieldPlaceholder = (f: ProfileFieldDef) => (BUILTIN_FIELDS[f.id] && !f.label ? t(BUILTIN_FIELDS[f.id].placeholder) : '');

const KEY = 'kaiwa-shisan:profile-fields';
const defaults = (): ProfileFieldDef[] => PROFILE_KEYS.map((id) => ({ id }));

const load = (): ProfileFieldDef[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ProfileFieldDef[]) : null;
    return Array.isArray(list) && list.every((x) => typeof x?.id === 'string') ? list : defaults();
  } catch {
    return defaults();
  }
};

let current = load();
const listeners = new Set<() => void>();

const save = (next: ProfileFieldDef[]) => {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 保存できない環境では今回だけ反映 */ }
  listeners.forEach((f) => f());
};

export const getProfileFields = () => current;
/** 表示する項目(並び順どおり) */
export const visibleFields = (list = current) => list.filter((f) => !f.hidden);

export const profileFieldsApi = {
  rename(id: string, label: string) {
    const v = label.trim();
    const builtin = BUILTIN_FIELDS[id];
    save(current.map((f) => {
      if (f.id !== id) return f;
      if (builtin) return { ...f, label: v && v !== t(builtin.label) ? v : undefined };
      return v ? { ...f, label: v } : f;
    }));
  },
  move(id: string, dir: -1 | 1) {
    const vis = visibleFields();
    const i = vis.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= vis.length) return;
    const a = current.indexOf(vis[i]);
    const b = current.indexOf(vis[j]);
    const next = [...current];
    [next[a], next[b]] = [next[b], next[a]];
    save(next);
  },
  hide(id: string, hidden: boolean) {
    // 戻した項目は一番下へ
    const f = current.find((x) => x.id === id);
    if (!f) return;
    const rest = current.filter((x) => x.id !== id);
    save(hidden ? current.map((x) => (x.id === id ? { ...x, hidden: true } : x)) : [...rest, { ...f, hidden: undefined }]);
  },
  add(label: string): string {
    const id = 'f_' + newId().slice(0, 8);
    save([...current, { id, label: label.trim() }]);
    return id;
  },
  reset() {
    // 自分で足した項目は非表示にして残す(人に入れた値が消えないように)
    save([...defaults(), ...current.filter((f) => !BUILTIN_FIELDS[f.id]).map((f) => ({ ...f, hidden: true }))]);
  },
};

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => { listeners.delete(f); };
};

export const useProfileFields = () => useSyncExternalStore(subscribe, getProfileFields);
