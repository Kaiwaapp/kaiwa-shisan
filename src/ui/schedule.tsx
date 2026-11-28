// 予定: 自分の全部の予定(予定タブ)と、人ごとの予定(人の画面)。カレンダー表示とリスト表示を切り替えられる。
// iPhoneのカレンダーへは .ics ファイルで書き出す(Webアプリからは直接書き込めないため)。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDiscardGuard } from './discard';
import { entryHasPerson, today, type AppData, type EventAlarm, type ID, type ScheduleEvent, type Todo } from '../core/types';
import { addDays, eventsOf, sortEvents, splitByDate, toIcs } from '../core/schedule';
import { back, go, useData, usePref, useStore } from './hooks';
import { openTodos, todoMarks, todosOf, type TodoMark } from '../core/schedule';
import { ComboPicker, EntryList, Header, sameNameHints } from './components';
import { FoldHeader, useFold } from './folders';
import { useFeatures } from './features';
import { Sheet, toast, toastError } from './interact';
import { autoFocusRef } from './focus';
import { currentLang, t } from '../i18n';

const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEK_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const week = () => (currentLang() === 'ja' ? WEEK_JA : WEEK_EN);

/** 「11/26(木)」 */
export function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  const w = week()[new Date(y, m - 1, d).getDay()];
  const head = y === new Date().getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
  const now = today();
  const rel = ymd === now ? t('今日') : ymd === addDays(now, 1) ? t('明日') : '';
  return `${head}(${w})${rel ? ' ' + rel : ''}`;
}

const timeLabel = (e: ScheduleEvent) => (e.time ? (e.endTime ? `${e.time}–${e.endTime}` : e.time) : t('終日'));

/** 予定に付いている相手の名前(グループ名も) */
const whoOf = (e: ScheduleEvent, data: AppData) => [
  ...(e.groupIds ?? []).map((id) => data.groups.find((g) => g.id === id)?.name).filter((x): x is string => !!x),
  ...e.personIds.map((id) => data.people.find((p) => p.id === id)?.name).filter((x): x is string => !!x),
];

// ---- カレンダーへの書き出し ----
function CalendarExport({ events, data, label, className, name = 'kaiwa-schedule.ics' }: {
  events: ScheduleEvent[];
  data: AppData;
  label: string;
  className: string;
  name?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const open = () => {
    if (!events.length) {
      toast(t('書き出す予定がありません'));
      return;
    }
    try {
      setFile(new File([toIcs(events, (event) => whoOf(event, data))], name, { type: 'text/calendar' }));
      setShareError(false);
    } catch {
      toastError(t('予定ファイルを作成できませんでした'));
    }
  };
  const download = () => {
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      toast(t('ファイルが開かない場合は、ダウンロード一覧を確認してください'), 5000);
    } catch {
      toastError(t('予定ファイルを保存できませんでした'));
    }
  };
  const share = async () => {
    if (!file || sharing) return;
    setSharing(true);
    setShareError(false);
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setShareError(true);
    } finally {
      setSharing(false);
    }
  };
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={open}>{label}</button>
      {file && (
        <Sheet title={t('カレンダーへ')} onClose={() => setFile(null)} cancelLabel={t('閉じる')}>
          <p className="muted small sheet-note">{t('共有するか、保存した.icsファイルを開いて、カレンダーに追加してください。')}</p>
          {typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }) && (
            <button type="button" className="sheet-item" disabled={sharing} onClick={share}>{t('予定ファイルを共有')}</button>
          )}
          {shareError && <p className="danger small sheet-note" role="alert">{t('共有できませんでした。予定ファイルを保存して開いてください。')}</p>}
          <button type="button" className="sheet-item" onClick={download}>{t('予定ファイルを保存（.ics）')}</button>
        </Sheet>
      )}
    </>
  );
}

// ---- 予定タブ ----
export function ScheduleScreen({ todo }: { todo?: boolean }) {
  const data = useData();
  const feat = useFeatures();
  const events = data.events ?? [];
  const upcoming = useMemo(() => splitByDate(events, today()).upcoming, [events]);
  // 予定とToDoの切り替え。最後に開いた方を覚えておき、タブから開いたときもそちらを出す
  const [last, setLast] = usePref<'events' | 'todo'>('scheduleTab', 'events');
  useEffect(() => {
    if (!feat.todo) return;
    if (todo) setLast('todo');
    else if (last === 'todo' && !location.hash.includes('/schedule/events')) location.replace('#/schedule/todo');
    else setLast('events');
  }, [todo]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCount = useMemo(() => openTodos(data.todos ?? []).length, [data.todos]);
  return (
    <div className="screen">
      <Header
        title={todo ? t('ToDo') : t('予定')}
        right={!todo && <CalendarExport events={upcoming} data={data} label={t('カレンダーへ')} className="link" />}
      />
      {feat.todo && (
        <div className="seg seg-wide" role="tablist">
          <button role="tab" aria-selected={!todo} className={!todo ? 'on' : ''} onClick={() => location.replace('#/schedule/events')}>{t('予定')}</button>
          <button role="tab" aria-selected={!!todo} className={todo ? 'on' : ''} onClick={() => location.replace('#/schedule/todo')}>{t('ToDo')}{openCount > 0 && <span className="n"> {openCount}</span>}</button>
        </div>
      )}
      {todo ? <TodoView newHref="/todo/new" /> : <>
        <ScheduleView events={events} todos={feat.todo ? data.todos : undefined} newHref="/event/new" />
        <p className="muted small schedule-note">{t('「カレンダーへ」で、これからの予定をiPhoneなどのカレンダーに追加できます（.icsファイル）。')}</p>
      </>}
    </div>
  );
}

/** 人の画面の「予定」欄 */
export function PersonSchedule({ person }: { person: { id: ID; name: string; groupIds?: ID[] } }) {
  const data = useData();
  const feat = useFeatures();
  const [open, setOpen] = useFold('person-schedule');
  const mine = useMemo(() => eventsOf(data.events ?? [], person), [data.events, person]);
  const myTodos = useMemo(() => (feat.todo ? todosOf(data.todos ?? [], person) : undefined), [feat.todo, data.todos, person]);
  const upcoming = useMemo(() => splitByDate(mine, today()).upcoming, [mine]);
  const next = upcoming[0];
  return (
    <>
      <FoldHeader label={t('予定')} count={upcoming.length} open={open} onToggle={() => setOpen(!open)} />
      {!open && next && <EventRow e={next} data={data} hidePersonId={person.id} withDate />}
      {open && <ScheduleView events={mine} todos={myTodos} newHref={`/event/new?person=${person.id}`} hidePersonId={person.id} compact />}
    </>
  );
}

/** 1日の中に並べるもの: 予定、またはToDo(開始日・期限の日) */
type DayItem = { date: string; event: ScheduleEvent } | (TodoMark & { event?: undefined });

/** 予定と、開始日・期限のあるToDoを日付順に。同じ日は予定(時刻順)のあとにToDo */
function dayItems(events: ScheduleEvent[], todos: Todo[] | undefined): DayItem[] {
  const items: DayItem[] = [...sortEvents(events).map((e) => ({ date: e.date, event: e })), ...todoMarks(todos ?? [])];
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.event ? 0 : 1) - (b.event ? 0 : 1));
}

const itemKey = (it: DayItem) => (it.event ? it.event.id : it.todo.id + it.mark);

function ItemRow({ it, data, hidePersonId }: { it: DayItem; data: AppData; hidePersonId?: ID }) {
  return it.event
    ? <EventRow e={it.event} data={data} hidePersonId={hidePersonId} />
    : <TodoRow x={it.todo} data={data} hidePersonId={hidePersonId} mark={it.mark} />;
}

function ScheduleView({ events, todos, newHref, hidePersonId, compact }: { events: ScheduleEvent[]; todos?: Todo[]; newHref: string; hidePersonId?: ID; compact?: boolean }) {
  const [view, setView] = usePref<'calendar' | 'list'>('scheduleView', 'calendar');
  const add = (date?: string) => go(newHref + (date ? (newHref.includes('?') ? '&' : '?') + 'date=' + date : ''));
  return (
    <div className="schedule">
      <div className="schedule-bar">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>{t('カレンダー')}</button>
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t('リスト')}</button>
        </div>
        {compact && <button className="link" onClick={() => add()}>{t('＋ 予定を追加')}</button>}
      </div>
      {view === 'calendar'
        ? <MonthView events={events} todos={todos} hidePersonId={hidePersonId} onAdd={add} />
        : <ListView events={events} todos={todos} hidePersonId={hidePersonId} />}
    </div>
  );
}

function MonthView({ events, todos, hidePersonId, onAdd }: { events: ScheduleEvent[]; todos?: Todo[]; hidePersonId?: ID; onAdd: (date: string) => void }) {
  const data = useData();
  const now = today();
  const { calendarHistory } = useFeatures();
  const [sel, setSel] = useState(() => {
    const saved = history.state?.scheduleDay;
    return typeof saved === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : now;
  });
  const month = sel.slice(0, 7);
  const selectDay = (date: string) => {
    history.replaceState({ ...history.state, scheduleDay: date }, '');
    setSel(date);
  };
  const person = hidePersonId ? data.people.find((p) => p.id === hidePersonId) : undefined;
  const entriesByDay = useMemo(() => {
    const days = new Map<string, typeof data.entries>();
    if (calendarHistory) {
      for (const entry of data.entries) {
        if (person && !entryHasPerson(entry, person)) continue;
        const entries = days.get(entry.talkedOn);
        if (entries) entries.push(entry);
        else days.set(entry.talkedOn, [entry]);
      }
    }
    return days;
  }, [calendarHistory, data.entries, person]);
  const byDay = useMemo(() => {
    const m = new Map<string, DayItem[]>();
    for (const it of dayItems(events, todos)) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    return m;
  }, [events, todos]);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const days = new Date(y, mo, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${p(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => {
    const d = new Date(y, mo - 1 + n, 1);
    selectDay(today(d));
  };
  const dayEvents = byDay.get(sel) ?? [];
  const dayEntries = entriesByDay.get(sel) ?? [];
  return (
    <>
      <div className="cal">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label={t('前の月')}>‹</button>
          <button className="cal-title" onClick={() => selectDay(now)}>{currentLang() === 'ja' ? `${y}年${mo}月` : `${y}/${mo}`}</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label={t('次の月')}>›</button>
        </div>
        <div className="cal-grid">
          {week().map((w, i) => <div key={w} className={`cal-w${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={'x' + i} />;
            const n = byDay.get(d)?.length ?? 0;
            const notes = entriesByDay.get(d)?.length ?? 0;
            return (
              <button key={d} className={`cal-d${d === now ? ' today' : ''}${d === sel ? ' sel' : ''}`} onClick={() => selectDay(d)} aria-pressed={d === sel}
                aria-label={[dayLabel(d), n ? t('予定・ToDo {n}件', { n }) : '', notes ? t('話題 {n}件', { n: notes }) : ''].filter(Boolean).join(' ')}>
                <span>{Number(d.slice(8))}</span>
                <span className="cal-dots" aria-hidden="true">{n > 0 && '•'.repeat(Math.min(n, 3))}{notes > 0 && <span className="cal-topic-mark">▪</span>}</span>
              </button>
            );
          })}
        </div>
      </div>
      {calendarHistory && <p className="muted small schedule-note">{t('• 予定・ToDo　▪ 話題')}</p>}
      <div className="section-title schedule-day">
        <span>{dayLabel(sel)}</span>
        <button className="link small-link" onClick={() => onAdd(sel)}>{t('＋ この日に予定を追加')}</button>
      </div>
      {dayEvents.length
        ? <div className="list">{dayEvents.map((it) => <ItemRow key={itemKey(it)} it={it} data={data} hidePersonId={hidePersonId} />)}</div>
        : <p className="muted small schedule-empty">{t('予定はありません')}</p>}
      {calendarHistory && (
        <>
          <div className="section-title">{t('この日の話題')}</div>
          <EntryList entries={dayEntries} data={data} hidePersonId={hidePersonId} empty={t('この日の話題はありません')} />
        </>
      )}
    </>
  );
}

function ListView({ events, todos, hidePersonId }: { events: ScheduleEvent[]; todos?: Todo[]; hidePersonId?: ID }) {
  const data = useData();
  const { upcoming, past } = useMemo(() => {
    const now = today();
    const all = dayItems(events, todos);
    return { upcoming: all.filter((x) => x.date >= now), past: all.filter((x) => x.date < now).reverse() };
  }, [events, todos]);
  const [pastOpen, setPastOpen] = useState(false);
  const groups = (xs: DayItem[]) => {
    const out: [string, DayItem[]][] = [];
    for (const e of xs) {
      const last = out[out.length - 1];
      if (last && last[0] === e.date) last[1].push(e); else out.push([e.date, [e]]);
    }
    return out;
  };
  const render = (xs: DayItem[]) => groups(xs).map(([d, es]) => (
    <div key={d}>
      <div className="section-title">{dayLabel(d)}</div>
      <div className="list">{es.map((it) => <ItemRow key={itemKey(it)} it={it} data={data} hidePersonId={hidePersonId} />)}</div>
    </div>
  ));
  return (
    <>
      {upcoming.length ? render(upcoming) : <p className="muted small schedule-empty">{t('これからの予定はありません')}</p>}
      {past.length > 0 && (
        <>
          <FoldHeader label={t('過去の予定')} count={past.length} open={pastOpen} onToggle={() => setPastOpen(!pastOpen)} />
          {pastOpen && render(past)}
        </>
      )}
    </>
  );
}

function EventRow({ e, data, hidePersonId, withDate }: { e: ScheduleEvent; data: AppData; hidePersonId?: ID; withDate?: boolean }) {
  const hints = sameNameHints(data.people, data.groups);
  const groups = (e.groupIds ?? []).map((id) => data.groups.find((g) => g.id === id)).filter(Boolean);
  const people = e.personIds.filter((id) => id !== hidePersonId).map((id) => data.people.find((p) => p.id === id)).filter(Boolean);
  return (
    <button className="card event-row" onClick={() => go(`/event/${e.id}`)}>
      <span className="event-time">{withDate ? dayLabel(e.date) + ' ' : ''}{timeLabel(e)}</span>
      <span className="card-head">{e.title || t('（タイトルなし）')}</span>
      {(e.place || e.memo) && <span className="card-rest">{[e.place, e.memo].filter(Boolean).join(' ・ ')}</span>}
      {(groups.length > 0 || people.length > 0) && (
        <span className="card-meta">
          {groups.map((g) => <span key={g!.id} className="chip group small">{g!.name}</span>)}
          {people.map((p) => <span key={p!.id} className="chip person small">{p!.name}{hints.get(p!.id) && <span className="hint">（{hints.get(p!.id)}）</span>}</span>)}
        </span>
      )}
    </button>
  );
}

/**
 * 予定タブのアイコンに出す赤い数字: 今日・明日の予定と、期限が明日まで(過ぎたものも)の終わっていないToDoの数。
 * アプリを開いたときに気づけるように
 */
export function useScheduleBadge(): number {
  const data = useData();
  const feat = useFeatures();
  const now = today();
  const tomorrow = addDays(now, 1);
  return useMemo(() => {
    if (!feat.schedule || !feat.scheduleToday) return 0;
    const ev = (data.events ?? []).filter((e) => e.date === now || e.date === tomorrow).length;
    const td = feat.todo ? openTodos(data.todos ?? []).filter((x) => x.due && x.due <= tomorrow).length : 0;
    return ev + td;
  }, [data.events, data.todos, feat.schedule, feat.scheduleToday, feat.todo, now, tomorrow]);
}

// ---- ToDo ----
/** 人の画面の「ToDo」欄(その人・その人のグループのToDo) */
export function PersonTodos({ person }: { person: { id: ID; name: string; groupIds?: ID[] } }) {
  const data = useData();
  const [open, setOpen] = useFold('person-todo');
  const mine = useMemo(() => todosOf(data.todos ?? [], person), [data.todos, person]);
  const n = mine.filter((x) => !x.done).length;
  return (
    <>
      <FoldHeader label={t('ToDo')} count={n} open={open} onToggle={() => setOpen(!open)} />
      {open && <TodoView todos={mine} personId={person.id} hidePersonId={person.id} newHref={`/todo/new?person=${person.id}`} />}
    </>
  );
}

function TodoView({ todos, personId, hidePersonId, newHref }: { todos?: Todo[]; personId?: ID; hidePersonId?: ID; newHref: string }) {
  const data = useData();
  const store = useStore();
  const all = todos ?? data.todos ?? [];
  const [filter, setFilter] = useState('');
  const genres = [...new Set(all.flatMap((todo) => todo.genre ? [todo.genre] : []))].sort();
  const genre = genres.find((name) => filter === 'genre:' + name);
  const activeFilter = genre ? filter : filter === 'none' && genres.length ? 'none' : '';
  const filtered = activeFilter ? all.filter((todo) => (todo.genre || undefined) === genre) : all;
  const open = openTodos(filtered);
  const done = filtered.filter((todo) => todo.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const [doneOpen, setDoneOpen] = useFold('todo-done' + (personId ? '-p' : ''));
  const [draft, setDraft] = useState('');
  const add = async () => {
    if (!draft.trim()) return;
    await store.saveTodo({ text: draft, genre, personIds: personId ? [personId] : [] });
    setDraft('');
  };
  return (
    <div className="todo">
      <div className="todo-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void add(); } }}
          placeholder={t('ToDoを入力して追加')}
          aria-label={t('ToDoを追加')}
          enterKeyHint="done"
        />
        <button className="btn small" disabled={!draft.trim()} onClick={add}>{t('追加')}</button>
      </div>
      <div className="todo-more"><button className="link small-link" onClick={() => go(newHref)}>{t('＋ 開始日・期限や相手を付けて追加')}</button></div>
      {genres.length > 0 && (
        <label className="field">
          {t('ToDoのジャンル')}
          <select className="select block" value={activeFilter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('すべてのジャンル')}</option>
            <option value="none">{t('ジャンルなし')}</option>
            {genres.map((name) => <option key={name} value={'genre:' + name}>{name}</option>)}
          </select>
        </label>
      )}
      {open.length
        ? <div className="list">{open.map((x) => <TodoRow key={x.id} x={x} data={data} hidePersonId={hidePersonId} />)}</div>
        : <p className="muted small schedule-empty">{t('やることはありません')}</p>}
      {done.length > 0 && (
        <>
          <FoldHeader label={t('完了')} count={done.length} open={doneOpen} onToggle={() => setDoneOpen(!doneOpen)} />
          {doneOpen && <>
            <div className="list">{done.map((x) => <TodoRow key={x.id} x={x} data={data} hidePersonId={hidePersonId} />)}</div>
            <button className="link small-link todo-clear" onClick={async () => {
              if (!confirm(t('完了したToDo{n}件を削除しますか？', { n: done.length }))) return;
              await store.deleteTodos(done.map((x) => x.id));
            }}>{t('完了したものを削除')}</button>
          </>}
        </>
      )}
    </div>
  );
}

/** mark: 予定のカレンダー・リストに出すとき、その日が開始日か期限か */
function TodoRow({ x, data, hidePersonId, mark }: { x: Todo; data: AppData; hidePersonId?: ID; mark?: 'start' | 'due' }) {
  const store = useStore();
  const hints = sameNameHints(data.people, data.groups);
  const groups = (x.groupIds ?? []).map((id) => data.groups.find((g) => g.id === id)).filter(Boolean);
  const people = x.personIds.filter((id) => id !== hidePersonId).map((id) => data.people.find((p) => p.id === id)).filter(Boolean);
  const overdue = !x.done && !!x.due && x.due < today();
  return (
    <div className={`card todo-row${x.done ? ' done' : ''}`}>
      <button
        className={`todo-check${x.done ? ' on' : ''}`}
        role="checkbox"
        aria-checked={x.done}
        aria-label={x.done ? t('未完了に戻す') : t('完了にする')}
        onClick={() => store.setTodoDone(x.id, !x.done)}
      ><span className="todo-circle" aria-hidden>{x.done ? '✓' : ''}</span></button>
      <button className="todo-body" onClick={() => go(`/todo/${x.id}`)}>
        {mark && <span className="event-time">{mark === 'start' ? t('ToDo・開始') : t('ToDo・期限')}</span>}
        <span className="todo-text">{x.text}</span>
        {((!mark && (x.start || x.due)) || x.genre || groups.length > 0 || people.length > 0) && (
          <span className="card-meta">
            {x.genre && <span className="chip small">{x.genre}</span>}
            {!mark && x.start && x.start !== x.due && <span className="date">{t('開始 {d}', { d: dayLabel(x.start) })}</span>}
            {!mark && x.due && <span className={`date${overdue ? ' overdue' : ''}`}>{t('期限 {d}', { d: dayLabel(x.due) })}</span>}
            {groups.map((g) => <span key={g!.id} className="chip group small">{g!.name}</span>)}
            {people.map((p) => <span key={p!.id} className="chip person small">{p!.name}{hints.get(p!.id) && <span className="hint">（{hints.get(p!.id)}）</span>}</span>)}
          </span>
        )}
      </button>
    </div>
  );
}

export function TodoEditor({ id, initialPerson }: { id?: ID; initialPerson?: ID }) {
  const store = useStore();
  const data = useData();
  const feat = useFeatures();
  const existing = id ? data.todos?.find((x) => x.id === id) : undefined;
  const [text, setText] = useState(existing?.text ?? '');
  const [genre, setGenre] = useState(existing?.genre ?? '');
  const genres = [...new Set([t('ルーティン業務'), ...(data.todos ?? []).flatMap((todo) => todo.genre ? [todo.genre] : [])])];
  const [start, setStart] = useState(existing?.start ?? '');
  const [due, setDue] = useState(existing?.due ?? '');
  const [personIds, setPersonIds] = useState<ID[]>(() => existing?.personIds ?? (initialPerson ? [initialPerson] : []));
  const [groupIds, setGroupIds] = useState<ID[]>(() => existing?.groupIds ?? []);
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const hints = sameNameHints(data.people, data.groups);
  const personOpts = data.people.map((p) => ({ id: p.id, name: p.name, reading: p.reading, rank: p.selectedAt ?? p.viewedAt ?? p.createdAt, hint: hints.get(p.id) }));
  const groupOpts = useMemo(() => {
    const count = new Map<ID, number>();
    for (const p of data.people) for (const g of p.groupIds ?? []) count.set(g, (count.get(g) ?? 0) + 1);
    return data.groups.map((g) => ({ id: g.id, name: g.name, count: count.get(g.id) ?? 0, rank: g.selectedAt ?? g.createdAt }));
  }, [data.groups, data.people]);
  const snap = JSON.stringify([text, genre, start, due, personIds, groupIds, newPeople]);
  const [initial] = useState(snap);
  const guardSave = useRef<() => Promise<boolean>>(async () => false);
  const { guard, sheet } = useDiscardGuard(!saving && snap !== initial, text.trim() ? () => guardSave.current() : undefined);

  if (id && !existing) {
    return (
      <div className="screen">
        <Header title="" left={<button className="link" onClick={() => back('/schedule/todo')}>{t('‹ 戻る')}</button>} />
        <div className="empty">{t('見つかりませんでした（削除された可能性があります）')}</div>
      </div>
    );
  }
  const canSave = !!text.trim() && !saving;
  const persist = async () => {
    if (!canSave) return false;
    setSaving(true);
    try {
      await store.saveTodo({ text, genre, start: start || undefined, due: due || undefined, personIds, groupIds: feat.groups ? groupIds : existing?.groupIds, newPeople }, id);
      return true;
    } catch {
      toast(t('保存できませんでした。もう一度お試しください'));
      setSaving(false);
      return false;
    }
  };
  guardSave.current = persist;
  const save = async () => { if (await persist()) back('/schedule/todo'); };
  const remove = async () => {
    if (!existing || !confirm(t('このToDoを削除しますか？'))) return;
    await store.deleteTodos([existing.id]);
    back('/schedule/todo');
  };
  return (
    <div className="screen editor">
      <Header
        title={existing ? t('ToDoを編集') : t('新しいToDo')}
        left={<button className="link" onClick={() => guard(() => back('/schedule/todo'))}>{t('キャンセル')}</button>}
        right={<button className={`link strong ${canSave ? '' : 'dim'}`} aria-disabled={!canSave} onClick={save}>{saving ? t('保存中…') : t('保存')}</button>}
      />
      {sheet}
      <div className="form">
        <textarea className="textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('やること（例：Aさんにお店を送る）')} aria-label={t('やること')} ref={!existing ? autoFocusRef : undefined} />
        <section className="field">
          <label>{t('相手')}</label>
          <ComboPicker
            kind="person"
            options={personOpts}
            groups={feat.groups ? groupOpts : []}
            selectedGroups={groupIds}
            onGroupsChange={setGroupIds}
            suggest={feat.recent}
            allowSameName
            selected={personIds}
            newNames={newPeople}
            onChange={(s, n) => { setPersonIds(s); setNewPeople(n); }}
          />
        </section>
        <section className="field">
          <label htmlFor="todoGenre">{t('ToDoのジャンル')}</label>
          <input id="todoGenre" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder={t('なくてもOK')} />
          <div className="chips">
            {genres.map((name) => (
              <button key={name} type="button" className={`chip small${genre === name ? ' on' : ''}`} aria-pressed={genre === name}
                onClick={() => setGenre(genre === name ? '' : name)}>{name}</button>
            ))}
          </div>
        </section>
        <section className="field row">
          <label htmlFor="todoStart">{t('開始日')}</label>
          <span className="time-range">
            <input id="todoStart" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            {start ? <button className="link small-link" onClick={() => setStart('')}>{t('開始日なしにする')}</button> : <span className="muted small">{t('なくてもOK')}</span>}
          </span>
        </section>
        <section className="field row">
          <label htmlFor="todoDue">{t('期限')}</label>
          <span className="time-range">
            <input id="todoDue" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            {due ? <button className="link small-link" onClick={() => setDue('')}>{t('期限なしにする')}</button> : <span className="muted small">{t('なくてもOK')}</span>}
          </span>
        </section>
        {start && due && start > due && <p className="ai-msg error">{t('開始日が期限より後になっています')}</p>}
        {(start || due) && <p className="muted small">{t('開始日・期限の日に、予定のカレンダーとリストにも表示されます。')}</p>}
        {existing && (
          <button className="btn block" onClick={() => store.setTodoDone(existing.id, !existing.done)}>{existing.done ? t('未完了に戻す') : t('✓ 完了にする')}</button>
        )}
        {existing && <button className="btn danger block" onClick={remove}>{t('このToDoを削除')}</button>}
      </div>
    </div>
  );
}

// ---- 予定の追加・編集 ----
const ALARMS: { v: EventAlarm | ''; label: string; allDay?: string }[] = [
  { v: '', label: 'なし' },
  { v: 'start', label: '開始時刻', allDay: '当日の朝9時' },
  { v: '1h', label: '1時間前' },
  { v: '1d', label: '前日の同じ時刻', allDay: '前日の朝9時' },
];

export function EventEditor({ id, initialPerson, initialGroup, initialDate }: { id?: ID; initialPerson?: ID; initialGroup?: ID; initialDate?: string }) {
  const store = useStore();
  const data = useData();
  const feat = useFeatures();
  const existing = id ? data.events?.find((e) => e.id === id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.date ?? (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today()));
  const [time, setTime] = useState(existing?.time ?? '');
  const [endTime, setEndTime] = useState(existing?.endTime ?? '');
  const [personIds, setPersonIds] = useState<ID[]>(() => existing?.personIds ?? (initialPerson ? [initialPerson] : []));
  const [groupIds, setGroupIds] = useState<ID[]>(() => existing?.groupIds ?? (initialGroup ? [initialGroup] : []));
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [place, setPlace] = useState(existing?.place ?? '');
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [alarm, setAlarm] = useState<EventAlarm | ''>(existing?.alarm ?? '');
  const [saving, setSaving] = useState(false);

  const hints = sameNameHints(data.people, data.groups);
  const personOpts = data.people.map((p) => ({ id: p.id, name: p.name, reading: p.reading, rank: p.selectedAt ?? p.viewedAt ?? p.createdAt, hint: hints.get(p.id) }));
  const groupOpts = useMemo(() => {
    const count = new Map<ID, number>();
    for (const p of data.people) for (const g of p.groupIds ?? []) count.set(g, (count.get(g) ?? 0) + 1);
    return data.groups.map((g) => ({ id: g.id, name: g.name, count: count.get(g.id) ?? 0, rank: g.selectedAt ?? g.createdAt }));
  }, [data.groups, data.people]);

  // 開いた時点の内容と違えば「入力した」とみなし、キャンセル時に確認する
  const snap = JSON.stringify([title, date, time, endTime, personIds, groupIds, newPeople, place, memo, alarm]);
  const [initial] = useState(snap);
  const guardSave = useRef<() => Promise<boolean>>(async () => false);
  const { guard, sheet } = useDiscardGuard(!saving && snap !== initial, title.trim() || personIds.length || newPeople.length ? () => guardSave.current() : undefined);

  if (id && !existing) {
    return (
      <div className="screen">
        <Header title="" left={<button className="link" onClick={() => back('/schedule')}>{t('‹ 戻る')}</button>} />
        <div className="empty">{t('見つかりませんでした（削除された可能性があります）')}</div>
      </div>
    );
  }

  const who = [...data.people.filter((p) => personIds.includes(p.id)).map((p) => p.name), ...newPeople];
  const canSave = !!(title.trim() || who.length) && !saving;
  /** 保存だけ行う(画面は移らない)。成功ならtrue */
  const persist = async () => {
    if (!canSave) return false;
    setSaving(true);
    try {
      // タイトルが空なら「〇〇さんと会う」にする
      const name = title.trim() || t('{name}と会う', { name: who.join('、') });
      await store.saveEvent({ title: name, date, time, endTime, personIds, groupIds: feat.groups ? groupIds : existing?.groupIds, newPeople, place, memo, alarm: alarm || undefined }, id);
      return true;
    } catch {
      toast(t('保存できませんでした。もう一度お試しください'));
      setSaving(false);
      return false;
    }
  };
  guardSave.current = persist;
  const save = async () => { if (await persist()) back('/schedule'); };
  const remove = async () => {
    if (!existing || !confirm(t('この予定を削除しますか？'))) return;
    await store.deleteEvent(existing.id);
    back('/schedule');
  };

  return (
    <div className="screen editor">
      <Header
        title={existing ? t('予定を編集') : t('新しい予定')}
        left={<button className="link" onClick={() => guard(() => back('/schedule'))}>{t('キャンセル')}</button>}
        right={<button className={`link strong ${canSave ? '' : 'dim'}`} aria-disabled={!canSave} onClick={save}>{saving ? t('保存中…') : t('保存')}</button>}
      />
      {sheet}
      <div className="form">
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('予定の名前（例：ごはん）')} aria-label={t('予定の名前')} ref={!existing && !initialPerson ? autoFocusRef : undefined} />
        <section className="field">
          <label>{t('相手')}</label>
          <ComboPicker
            kind="person"
            options={personOpts}
            groups={feat.groups ? groupOpts : []}
            selectedGroups={groupIds}
            onGroupsChange={setGroupIds}
            suggest={feat.recent}
            allowSameName
            selected={personIds}
            newNames={newPeople}
            onChange={(s, n) => { setPersonIds(s); setNewPeople(n); }}
          />
        </section>
        <section className="field row">
          <label htmlFor="evDate">{t('日付')}</label>
          <input id="evDate" type="date" value={date} onChange={(e) => setDate(e.target.value || today())} />
        </section>
        <section className="field row">
          <label htmlFor="evTime">{t('時刻')}</label>
          <span className="time-range">
            <input id="evTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('開始')} />
            {time && <>–<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label={t('終了')} /></>}
            {time
              ? <button className="link small-link" onClick={() => { setTime(''); setEndTime(''); }}>{t('終日にする')}</button>
              : <span className="muted small">{t('未入力は終日')}</span>}
          </span>
        </section>
        <section className="field">
          <label htmlFor="evPlace">{t('場所')}</label>
          <input id="evPlace" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t('なくてもOK')} />
        </section>
        <section className="field">
          <label htmlFor="evMemo">{t('話したいこと・メモ')}</label>
          <textarea id="evMemo" className="textarea" rows={4} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('この日に話したいことなど')} />
        </section>
        <section className="field row">
          <label htmlFor="evAlarm">{t('通知')}</label>
          <select id="evAlarm" className="select" value={alarm} onChange={(e) => setAlarm(e.target.value as EventAlarm | '')}>
            {ALARMS.filter((a) => time || a.v !== '1h').map((a) => <option key={a.v} value={a.v}>{t(!time && a.allDay ? a.allDay : a.label)}</option>)}
          </select>
        </section>
        <p className="muted small">{t('通知はカレンダーに追加したときに、カレンダーアプリから届きます。')}</p>
        {existing && (
          <CalendarExport events={[existing]} data={data} label={t('📅 カレンダーに追加（.ics）')} className="btn block" name="kaiwa-event.ics" />
        )}
        {existing && <button className="btn danger block" onClick={remove}>{t('この予定を削除')}</button>}
      </div>
    </div>
  );
}
