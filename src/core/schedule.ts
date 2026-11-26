// 予定の並べ替え・絞り込みと、カレンダー用ファイル(.ics)の作成。React非依存
import { entryHasPerson, type Person, type ScheduleEvent } from './types';

/** 日付+時刻で並べる(終日は同じ日の先頭) */
export const eventKey = (e: Pick<ScheduleEvent, 'date' | 'time'>) => `${e.date} ${e.time ?? ''}`;
export const sortEvents = (xs: ScheduleEvent[]) => [...xs].sort((a, b) => eventKey(a).localeCompare(eventKey(b)));

/** その人の予定(直接、またはグループのメンバーとして) */
export const eventsOf = (events: ScheduleEvent[], p: Pick<Person, 'id' | 'groupIds'>) =>
  events.filter((e) => entryHasPerson({ personIds: e.personIds, groupIds: e.groupIds }, p));

/** today 以降の予定と、それより前の予定(新しい順) */
export function splitByDate(events: ScheduleEvent[], today: string): { upcoming: ScheduleEvent[]; past: ScheduleEvent[] } {
  const s = sortEvents(events);
  return { upcoming: s.filter((e) => e.date >= today), past: s.filter((e) => e.date < today).reverse() };
}

export const addDays = (ymd: string, n: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

// ---- .ics (iCalendar) ----
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** 1行75バイトまでに折り返す(日本語の文字の途中では切らない) */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const ymd = (d: string) => d.replace(/-/g, '');
const hm = (t: string) => t.replace(':', '') + '00';
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

/** 通知の時間(開始からの差)。終日の予定は「当日9時」「前日9時」 */
function trigger(e: ScheduleEvent): string | null {
  if (!e.alarm) return null;
  if (!e.time) return e.alarm === '1d' ? '-PT15H' : 'PT9H';
  return e.alarm === '1d' ? '-P1D' : e.alarm === '1h' ? '-PT1H' : 'PT0M';
}

/**
 * 予定を .ics の文字列にする。時刻は端末の地域の時刻のまま(タイムゾーンを付けない)。
 * names: 相手の名前(説明欄に入れる)
 */
export function toIcs(events: ScheduleEvent[], names: (e: ScheduleEvent) => string[], now = Date.now()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//kaiwa-shisan//schedule//JA', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@kaiwa-shisan`, `DTSTAMP:${stamp(now)}`);
    if (e.time) {
      lines.push(`DTSTART:${ymd(e.date)}T${hm(e.time)}`);
      if (e.endTime) lines.push(`DTEND:${ymd(e.date)}T${hm(e.endTime)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(e.date, 1))}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
    const who = names(e);
    const desc = [who.length ? who.join('、') : '', e.memo ?? ''].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    const tr = trigger(e);
    if (tr) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${tr}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
