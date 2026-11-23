// AIでフォルダ整理(試作)。AIが振り分け先を提案し、ユーザーが選んで確定する。
import { useMemo, useState } from 'react';
import { aiErrorMessage, demoFolders, isDemo, organizeReady, suggestFolders, type OrganizeItem } from '../core/ai';
import { foldersOf } from '../core/store';
import { normalize } from '../core/search';
import type { FolderScope, ID } from '../core/types';
import { back, go, useData, useStore } from './hooks';
import { Header } from './components';
import { folderChoices, rootHref, SCOPE_LABEL } from './folders';
import { useAiSettings } from './AiTools';

const MAX_ITEMS = 100;

interface Row { id: ID; label: string; item: OrganizeItem; folderId: ID | null }
interface Plan { id: ID; label: string; folder: string; on: boolean }

export function OrganizeScreen({ scope }: { scope: FolderScope }) {
  const store = useStore();
  const data = useData();
  const [s] = useAiSettings();
  const [onlyLoose, setOnlyLoose] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [plan, setPlan] = useState<Plan[] | null>(null);

  const choices = useMemo(() => folderChoices(foldersOf(data.folders, scope)), [data.folders, scope]);

  const rows: Row[] = useMemo(() => {
    const topicName = new Map(data.topics.map((t) => [t.id, t.name]));
    const personName = new Map(data.people.map((p) => [p.id, p.name]));
    const entries = data.entries.filter((e) => !e.deletedAt);
    if (scope === 'entry') {
      return entries.map((e) => ({
        id: e.id,
        label: e.text.split('\n')[0].slice(0, 40),
        folderId: e.folderId,
        item: {
          text: e.text,
          hints: [
            ...e.topics.map((t) => topicName.get(t.topicId)).filter((x): x is string => !!x),
            ...e.personIds.map((p) => personName.get(p)).filter((x): x is string => !!x),
          ],
        },
      }));
    }
    if (scope === 'person') {
      return data.people.map((p) => {
        const count = new Map<string, number>();
        for (const e of entries) if (e.personIds.includes(p.id))
          for (const t of e.topics) { const n = topicName.get(t.topicId); if (n) count.set(n, (count.get(n) ?? 0) + 1); }
        const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
        return { id: p.id, label: p.name, folderId: p.folderId ?? null, item: { text: p.name + (p.memo ? ` (${p.memo})` : ''), hints: top } };
      });
    }
    return data.topics.map((t) => ({ id: t.id, label: '#' + t.name, folderId: t.folderId ?? null, item: { text: t.name, hints: [] } }));
  }, [data, scope]);

  const targets = (onlyLoose ? rows.filter((r) => !r.folderId) : rows).slice(0, MAX_ITEMS);

  if (!organizeReady(s)) {
    return (
      <div className="screen">
        <Header title="AIでフォルダ整理" left={<button className="link" onClick={() => back()}>戻る</button>} />
        <div className="empty">設定の「AI機能（試作）」で「AI機能を使う」と「フォルダの自動整理」をONにしてください。</div>
      </div>
    );
  }

  const run = async () => {
    setBusy(true); setErr(''); setInfo(''); setPlan(null);
    try {
      const labels = choices.map((c) => c.label);
      const items = targets.map((r) => r.item);
      const r = isDemo(s) ? await demoFolders(items, labels) : await suggestFolders(s.apiKey, scope, items, labels);
      const p = r.assignments.map((a) => ({ id: targets[a.index].id, label: targets[a.index].label, folder: a.folder, on: true }));
      // 今と同じフォルダへの提案は除く
      const cur = new Map(targets.map((t) => [t.id, t.folderId]));
      const filtered = p.filter((x) => { const id = findFolder(x.folder); return !id || id !== cur.get(x.id); });
      setPlan(filtered);
      setInfo(
        isDemo(s)
          ? 'お試し表示です(APIキー未設定のため、フォルダ名や話題名で簡易的に振り分けています)'
          : `提案しました(約${r.yen < 0.01 ? '0.01円未満' : r.yen.toFixed(2) + '円'})`,
      );
    } catch (e) {
      setErr(aiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const findFolder = (path: string): ID | undefined =>
    choices.find((c) => normalize(c.label) === normalize(path.split('/').map((x) => x.trim()).filter(Boolean).join(' / ')))?.id;

  /** 「親 / 子」の道のりのフォルダを探し、なければ作る */
  const ensureFolder = async (path: string): Promise<ID | null> => {
    let parent: ID | null = null;
    for (const name of path.split('/').map((x) => x.trim()).filter(Boolean)) {
      parent = (await store.addFolder(name, parent, scope)).id;
    }
    return parent;
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    const byFolder = new Map<ID, ID[]>();
    for (const p of plan.filter((x) => x.on)) {
      const fid = await ensureFolder(p.folder);
      if (!fid) continue;
      byFolder.set(fid, [...(byFolder.get(fid) ?? []), p.id]);
    }
    let n = 0;
    for (const [fid, ids] of byFolder) { await store.moveItems(scope, ids, fid); n += ids.length; }
    setBusy(false);
    setPlan(null);
    setInfo(`${n}件をフォルダに移動しました`);
  };

  const groups = plan
    ? [...plan.reduce((m, p, i) => m.set(p.folder, [...(m.get(p.folder) ?? []), i]), new Map<string, number[]>())]
    : [];
  const checked = plan?.filter((p) => p.on).length ?? 0;

  return (
    <div className="screen">
      <Header
        title={`AIで${SCOPE_LABEL[scope]}を整理`}
        left={<button className="link" onClick={() => back()}>戻る</button>}
      />
      <div className="form">
        <div className="chips">
          {(['entry', 'person', 'topic'] as const).map((k) => (
            <button key={k} className={'chip folder' + (k === scope ? ' on' : '')} onClick={() => go('/organize/' + k)}>
              {SCOPE_LABEL[k]}
            </button>
          ))}
        </div>
        <section className="panel">
          <p className="muted small">
            AIが{SCOPE_LABEL[scope]}の振り分け先のフォルダを提案します。既存のフォルダを優先し、合うものがなければ新しいフォルダを提案します。確認してから移動するので、勝手には動きません。
          </p>
          <label className="toggle">
            <input type="checkbox" checked={onlyLoose} onChange={(e) => { setOnlyLoose(e.target.checked); setPlan(null); }} />
            <span>フォルダに入っていないものだけ</span>
          </label>
          <p className="muted small">
            対象: {targets.length}件{rows.length > MAX_ITEMS && targets.length === MAX_ITEMS ? `(1回に${MAX_ITEMS}件まで)` : ''}
          </p>
          <button className="btn primary block" disabled={busy || targets.length === 0} onClick={run}>
            {busy && !plan ? '考え中…' : '✨ 振り分けを提案してもらう'}
          </button>
          {err && <p className="ai-msg error">{err}</p>}
          {info && <p className="ai-msg">{info}</p>}
        </section>

        {plan && plan.length === 0 && <div className="empty">移動したほうがよいものは見つかりませんでした。</div>}
        {plan && plan.length > 0 && (
          <>
            {groups.map(([folder, idxs]) => {
              const isNew = !findFolder(folder);
              return (
                <section key={folder} className="panel organize-group">
                  <h2>
                    📁 {folder} {isNew && <span className="badge-new">新しいフォルダ</span>}
                  </h2>
                  {idxs.map((i) => (
                    <label key={plan[i].id} className="toggle">
                      <input
                        type="checkbox"
                        checked={plan[i].on}
                        onChange={(e) => setPlan(plan.map((p, j) => (j === i ? { ...p, on: e.target.checked } : p)))}
                      />
                      <span className="organize-label">{plan[i].label || '(本文なし)'}</span>
                    </label>
                  ))}
                </section>
              );
            })}
            <button className="btn primary block" disabled={busy || checked === 0} onClick={apply}>
              選んだ{checked}件を移動する
            </button>
            <button className="btn ghost block" onClick={() => setPlan(null)}>やめる</button>
          </>
        )}
        {!plan && info.endsWith('移動しました') && (
          <button className="btn block" onClick={() => go(rootHref(scope))}>{SCOPE_LABEL[scope]}の一覧を見る</button>
        )}
      </div>
    </div>
  );
}
