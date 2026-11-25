import { useMemo, useState } from 'react';
import type { Group, ID, Person } from '../core/types';
import { NAME_SORTS, normalize, type NameSort } from '../core/search';
import { back, go, useData, usePref, useStore } from './hooks';
import { ComboPicker, Header, SortSelect } from './components';
import { NameRows, useNameItems } from './screens';
import { groupDropProps } from './interact';
import { FoldHeader, useFold } from './folders';
import { t } from '../i18n';

// 人のグループ。フォルダ(1人1か所・入れ子)と違い、タグのように1人を複数のグループに入れられる。

export const groupHref = (id: ID) => `/people/g/${id}`;

const byName = (a: Group, b: Group) => a.name.localeCompare(b.name, 'ja');

/** グループごとの人数 */
export function useGroupCounts() {
  const data = useData();
  return useMemo(() => {
    const m = new Map<ID, number>();
    for (const p of data.people) for (const g of p.groupIds ?? []) m.set(g, (m.get(g) ?? 0) + 1);
    return m;
  }, [data.people]);
}

/** その人が入っているグループ(名前順) */
export const groupsOf = (groups: Group[], p: Pick<Person, 'groupIds'>) =>
  groups.filter((g) => p.groupIds?.includes(g.id)).sort(byName);

/** 人タブの一番上に出すグループの列。タップでそのグループの人の一覧へ */
export function GroupBar() {
  const data = useData();
  const store = useStore();
  const counts = useGroupCounts();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const groups = [...data.groups].sort(byName);
  const [open, setOpen] = useFold('groups');
  const create = async () => {
    if (!name.trim()) return;
    const g = await store.addGroup(name);
    setName('');
    setAdding(false);
    go(groupHref(g.id));
  };
  return (
    <div className="group-bar">
      <FoldHeader label={t('グループ')} count={groups.length} open={open || adding} onToggle={() => { if (adding) { setAdding(false); setName(''); } setOpen(!(open || adding)); }} />
      {!(open || adding) ? null : adding ? (
        <div className="picker-input">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('例：マッチングアプリ、職場、大学の友達')}
            enterKeyHint="done"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); create(); } }}
          />
          <button className="btn small primary" disabled={!name.trim()} onClick={create}>{t('作成')}</button>
          <button className="btn small" onClick={() => { setAdding(false); setName(''); }}>{t('キャンセル')}</button>
        </div>
      ) : (
        <div className="chips folders">
          {groups.map((g) => (
            <button key={g.id} className="chip group" {...groupDropProps(g.id, g.name)} onClick={() => go(groupHref(g.id))}>
              {g.name} <span className="n">{counts.get(g.id) ?? 0}</span>
            </button>
          ))}
          <button className="chip folder ghost" onClick={() => setAdding(true)}>{t('＋ グループ')}</button>
        </div>
      )}
    </div>
  );
}

/** グループの画面: 入っている人の一覧。人の追加・外す、名前の変更・削除 */
export function GroupScreen({ id }: { id: ID }) {
  const data = useData();
  const store = useStore();
  const group = data.groups.find((g) => g.id === id);
  const [sort, setSort] = usePref<NameSort>('personSort', 'last');
  const all = useNameItems('person', sort);
  const inGroup = new Set(data.people.filter((p) => p.groupIds?.includes(id)).map((p) => p.id));
  const members = all.filter((p) => inGroup.has(p.id));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  if (!group) {
    return (
      <div className="screen">
        <Header title={t('グループ')} left={<button className="link" onClick={() => back('/people')}>{t('‹ 人')}</button>} />
        <div className="empty">{t('このグループは見つかりませんでした。')}</div>
      </div>
    );
  }

  const options = data.people.map((p) => ({ id: p.id, name: p.name, reading: p.reading, rank: p.selectedAt ?? p.createdAt }));
  const memberIds = members.map((p) => p.id);
  const change = async (next: ID[], newNames: string[]) => {
    const added = next.filter((x) => !memberIds.includes(x));
    const removed = memberIds.filter((x) => !next.includes(x));
    if (added.length) await store.setGroupMembers(id, added, true);
    if (removed.length) await store.setGroupMembers(id, removed, false);
    for (const n of newNames) {
      const found = store.findPersonByName(n);
      if (found) await store.setGroupMembers(id, [found.id], true);
      else await store.addPerson(n, null, [id]);
    }
  };

  return (
    <div className="screen">
      <Header
        title={group.name}
        left={<button className="link" onClick={() => back('/people')}>{t('‹ 人')}</button>}
        right={<button className="link" onClick={() => { setName(group.name); setEditing(!editing); }}>{editing ? t('閉じる') : t('編集')}</button>}
      />
      {editing ? (
        <div className="form">
          <section className="field">
            <label>{t('グループの名前')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </section>
          <button className="btn primary block" disabled={!name.trim()} onClick={async () => { await store.renameGroup(id, name); setEditing(false); }}>
            {t('保存')}
          </button>
          <button className="btn danger block" onClick={async () => {
            if (!confirm(t('グループ「{name}」を削除しますか？\n人や記録は消えず、グループへの紐づけだけ外れます。', { name: group.name }))) return;
            await store.deleteGroup(id);
            back('/people');
          }}>
            {t('このグループを削除')}
          </button>
        </div>
      ) : (
        <>
          <section className="field">
            <label>{t('このグループの人')}</label>
            <ComboPicker kind="person" options={options} selected={memberIds} newNames={[]} onChange={change} recent={20} />
          </section>
          {members.length > 0 ? (
            <>
              <div className="toolbar">
                <span className="count">{t('{n}人', { n: members.length })}</span>
                <SortSelect value={sort} options={NAME_SORTS} onChange={setSort} />
              </div>
              <NameRows kind="person" items={members} sort={sort} showFolder />
              <button className="btn block ghost" onClick={() => go(`/new?group=${id}`)}>
                {t('＋ 「{name}」の人に話したことを記録', { name: group.name })}
              </button>
            </>
          ) : (
            <div className="empty">{t('まだ誰もいません。')}<br />{t('上の欄から人を選ぶか、名前を入力して追加できます。')}</div>
          )}
        </>
      )}
    </div>
  );
}

/** 人の編集画面で、入るグループを選ぶ(複数可・その場で新しく作れる) */
export function GroupToggles({ value, onChange }: { value: ID[]; onChange: (ids: ID[]) => void }) {
  const data = useData();
  const store = useStore();
  const [name, setName] = useState('');
  const groups = [...data.groups].sort(byName);
  const toggle = (gid: ID) => onChange(value.includes(gid) ? value.filter((x) => x !== gid) : [...value, gid]);
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const g = await store.addGroup(n);
    if (!value.includes(g.id)) onChange([...value, g.id]);
    setName('');
  };
  const exists = name.trim() && data.groups.some((g) => normalize(g.name) === normalize(name.trim()));
  return (
    <div className="picker">
      {groups.length > 0 && (
        <div className="chips">
          {groups.map((g) => {
            const on = value.includes(g.id);
            return (
              <button key={g.id} type="button" className={`chip group ${on ? 'on' : ''}`} onClick={() => toggle(g.id)}>
                {on ? '✓ ' : ''}{g.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="picker-input">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('新しいグループの名前')}
          enterKeyHint="done"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }}
        />
        <button type="button" className="btn small" disabled={!name.trim()} onClick={add}>{exists ? t('選ぶ') : t('作成')}</button>
      </div>
    </div>
  );
}
