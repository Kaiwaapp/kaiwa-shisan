// 予定: 自分の全部の予定(予定タブ)と、人ごとの予定(人の画面)。カレンダー表示とリスト表示を切り替えられる。
// iPhoneのカレンダーへは .ics ファイルで書き出す(Webアプリからは直接書き込めないため)。
import { useMemo, useState } from 'react';
import { today, type AppData, type EventAlarm, type ID, type ScheduleEvent } from '../core/types';
import { addDays, eventsOf, sortEvents, splitByDate, toIcs } from '../core/schedule';
import { back, go, useData, usePref, useStore } from './hooks';
import { ComboPicker, Header, sameNameHints } from './components';
import { FoldHeader, useFold } from './folders';
import { useFeatures } from './features';
import { toast } from './interact';
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
export function exportIcs(events: ScheduleEvent[], data: AppData, name = 'kaiwa-schedule.ics') {
  if (!events.length) { toast(t('書き出す予定がありません')); return; }
  const ics = toIcs(events, (e) => whoOf(e, data));
  // iPhone(Safari・ホーム画面のアプリ)は text/calendar を開くと「カレンダーに追加」の画面が出る
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    return;
  }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- 予定タブ ----
export function ScheduleScreen() {
  const data = useData();
  const events = data.events ?? [];
  const upcoming = useMemo(() => splitByDate(events, today()).upcoming, [events]);
  return (
    <div className="screen">
      <Header
        title={t('予定')}
        right={<button className="link" onClick={() => exportIcs(upcoming, data)}>{t('カレンダーへ')}</button>}
      />
      <ScheduleView events={events} newHref="/event/new" />
      <p className="muted small schedule-note">{t('「カレンダーへ」で、これからの予定をiPhoneなどのカレンダーに追加できます（.icsファイル）。')}</p>
    </div>
  );
}

/** 人の画面の「予定」欄 */
export function PersonSchedule({ person }: { person: { id: ID; name: string; groupIds?: ID[] } }) {
  const data = useData();
  const [open, setOpen] = useFold('person-schedule');
  const mine = useMemo(() => eventsOf(data.events ?? [], person), [data.events, person]);
  const upcoming = useMemo(() => splitByDate(mine, today()).upcoming, [mine]);
  const next = upcoming[0];
  return (
    <>
      <FoldHeader label={t('予定')} count={upcoming.length} open={open} onToggle={() => setOpen(!open)} />
      {!open && next && <EventRow e={next} data={data} hidePersonId={person.id} withDate />}
      {open && <ScheduleView events={mine} newHref={`/event/new?person=${person.id}`} hidePersonId={person.id} compact />}
    </>
  );
}

function ScheduleView({ events, newHref, hidePersonId, compact }: { events: ScheduleEvent[]; newHref: string; hidePersonId?: ID; compact?: boolean }) {
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
        ? <MonthView events={events} hidePersonId={hidePersonId} onAdd={add} />
        : <ListView events={events} hidePersonId={hidePersonId} />}
    </div>
  );
}

function MonthView({ events, hidePersonId, onAdd }: { events: ScheduleEvent[]; hidePersonId?: ID; onAdd: (date: string) => void }) {
  const data = useData();
  const now = today();
  const [sel, setSel] = useState(now);
  const [month, setMonth] = useState(now.slice(0, 7));
  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of sortEvents(events)) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const days = new Date(y, mo, 0).getDate();
  const p = (n: number) => String(n).padStart(2, '0');
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${p(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => {
    const d = new Date(y, mo - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${p(d.getMonth() + 1)}`);
  };
  const dayEvents = byDay.get(sel) ?? [];
  return (
    <>
      <div className="cal">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label={t('前の月')}>‹</button>
          <button className="cal-title" onClick={() => { setMonth(now.slice(0, 7)); setSel(now); }}>{currentLang() === 'ja' ? `${y}年${mo}月` : `${y}/${mo}`}</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label={t('次の月')}>›</button>
        </div>
        <div className="cal-grid">
          {week().map((w, i) => <div key={w} className={`cal-w${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={'x' + i} />;
            const n = byDay.get(d)?.length ?? 0;
            return (
              <button key={d} className={`cal-d${d === now ? ' today' : ''}${d === sel ? ' sel' : ''}`} onClick={() => setSel(d)} aria-label={dayLabel(d) + (n ? ' ' + t('{n}件', { n }) : '')}>
                <span>{Number(d.slice(8))}</span>
                <span className="cal-dots">{n > 0 && '•'.repeat(Math.min(n, 3))}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="section-title schedule-day">
        <span>{dayLabel(sel)}</span>
        <button className="link small-link" onClick={() => onAdd(sel)}>{t('＋ この日に追加')}</button>
      </div>
      {dayEvents.length
        ? <div className="list">{dayEvents.map((e) => <EventRow key={e.id} e={e} data={data} hidePersonId={hidePersonId} />)}</div>
        : <p className="muted small schedule-empty">{t('予定はありません')}</p>}
    </>
  );
}

function ListView({ events, hidePersonId }: { events: ScheduleEvent[]; hidePersonId?: ID }) {
  const data = useData();
  const { upcoming, past } = useMemo(() => splitByDate(events, today()), [events]);
  const [pastOpen, setPastOpen] = useState(false);
  const groups = (xs: ScheduleEvent[]) => {
    const out: [string, ScheduleEvent[]][] = [];
    for (const e of xs) {
      const last = out[out.length - 1];
      if (last && last[0] === e.date) last[1].push(e); else out.push([e.date, [e]]);
    }
    return out;
  };
  const render = (xs: ScheduleEvent[]) => groups(xs).map(([d, es]) => (
    <div key={d}>
      <div className="section-title">{dayLabel(d)}</div>
      <div className="list">{es.map((e) => <EventRow key={e.id} e={e} data={data} hidePersonId={hidePersonId} />)}</div>
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

/** 記録タブの一番上に出す、今日・明日の予定(アプリを開いたときに気づけるように) */
export function TodayEvents() {
  const data = useData();
  const feat = useFeatures();
  const now = today();
  const tomorrow = addDays(now, 1);
  const soon = useMemo(() => sortEvents((data.events ?? []).filter((e) => e.date === now || e.date === tomorrow)), [data.events, now, tomorrow]);
  if (!feat.schedule || !feat.scheduleToday || !soon.length) return null;
  return (
    <section className="panel today-events">
      <div className="panel-sub">{t('今日・明日の予定')}</div>
      {soon.map((e) => <EventRow key={e.id} e={e} data={data} withDate />)}
    </section>
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
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // タイトルが空なら「〇〇さんと会う」にする
      const name = title.trim() || t('{name}と会う', { name: who.join('、') });
      await store.saveEvent({ title: name, date, time, endTime, personIds, groupIds: feat.groups ? groupIds : existing?.groupIds, newPeople, place, memo, alarm: alarm || undefined }, id);
      back('/schedule');
    } catch {
      toast(t('保存できませんでした。もう一度お試しください'));
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!existing || !confirm(t('この予定を削除しますか？'))) return;
    await store.deleteEvent(existing.id);
    back('/schedule');
  };

  return (
    <div className="screen editor">
      <Header
        title={existing ? t('予定を編集') : t('新しい予定')}
        left={<button className="link" onClick={() => back('/schedule')}>{t('キャンセル')}</button>}
        right={<button className={`link strong ${canSave ? '' : 'dim'}`} aria-disabled={!canSave} onClick={save}>{saving ? t('保存中…') : t('保存')}</button>}
      />
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
          <button className="btn block" onClick={() => exportIcs([existing], data, 'kaiwa-event.ics')}>{t('📅 カレンダーに追加（.ics）')}</button>
        )}
        {existing && <button className="btn danger block" onClick={remove}>{t('この予定を削除')}</button>}
      </div>
    </div>
  );
}
