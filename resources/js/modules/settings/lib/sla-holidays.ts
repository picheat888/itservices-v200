// Pure helpers for the SLA holiday editor: pasted-text parser, month summary, fixed-date copy and row checks.
export type HolidayRow = { key: string; date: string; name: string };
type DateName = { date: string; name: string };
export type LineError = 'no_date' | 'bad_date' | 'no_name' | 'other_year';
export type RowError = { date?: 'required' | 'other_year' | 'taken'; name?: 'required' | 'too_long' };
export const HOLIDAY_NAME_MAX = 100;
export const HOLIDAYS_PER_YEAR_MAX = 60;

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MON_FULL = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
];

// Holidays whose month-day is the same every year
const FIXED_MONTH_DAYS = new Set([
    '01-01',
    '04-06',
    '04-13',
    '04-14',
    '04-15',
    '05-01',
    '05-04',
    '06-03',
    '07-28',
    '08-12',
    '10-13',
    '10-23',
    '12-05',
    '12-10',
    '12-31',
]);

// Longest words first so full month names win over short ones
const MONTH_WORDS: [string, number][] = [
    ...TH_MON.map((word, index): [string, number] => [word, index]),
    ...TH_MON_FULL.map((word, index): [string, number] => [word, index]),
].sort((a, b) => b[0].length - a[0].length);
const MONTH_PATTERN = MONTH_WORDS.map(([word]) => word.replace(/\./g, '\\.')).join('|');
const RE_DMY = /(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})/;
const RE_YMD = /(\d{4})-(\d{1,2})-(\d{1,2})/;
const RE_THAI = new RegExp(`(\\d{1,2})\\s*(${MONTH_PATTERN})\\s*(\\d{4})`);
const RE_THAI_RANGE = new RegExp(`(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s*(${MONTH_PATTERN})\\s*(\\d{4})`);
const MAX_RANGE_DAYS = 31;
const WEEKDAY_TH = '(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)(?:ที่)?';
const WEEKDAY_EN = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tues|Tue|Wed|Thurs|Thu|Fri|Sat|Sun)\\.?(?![A-Za-z])';
const WEEKDAY = `(?:${WEEKDAY_TH}|${WEEKDAY_EN})`;
const BRACKETED_WEEKDAYS = `[(（]\\s*${WEEKDAY}(?:\\s*[-–]\\s*${WEEKDAY})?\\s*[)）]`;
const DASHES = '\\-\u2010-\u2015\u2212';
const RE_LIST_MARK = new RegExp(`^(?:\\d{1,3}[.)]|[${DASHES}•*])\\s+`);
const RE_EDGES = new RegExp(`^[\\s,:${DASHES}]+|[\\s,:${DASHES}]+$`, 'g');
const RE_ONLY_WEEKDAY = new RegExp(`^[\\s,]*(?:${WEEKDAY}|วันที่|ที่)?[\\s,]*$`, 'i');
const RE_AFTER_DATE = new RegExp(`^[\\s,]*(?:${BRACKETED_WEEKDAYS}|${WEEKDAY_TH}(?=\\s)|${WEEKDAY_EN},)`, 'i');
const RE_LAST_BRACKETED = new RegExp(`\\s*${BRACKETED_WEEKDAYS}\\s*$`, 'i');

// The text around the date, less a list number, a lone weekday before the date and a weekday beside or after it
function nameAround(line: string, date: string): string {
    const at = line.indexOf(date);
    const lead = line.slice(0, at).replace(RE_LIST_MARK, '');
    const before = RE_ONLY_WEEKDAY.test(lead) ? '' : lead;
    const after = line
        .slice(at + date.length)
        .replace(RE_AFTER_DATE, '')
        .replace(RE_LAST_BRACKETED, '');
    return `${before} ${after}`.replace(/\s+/g, ' ').replace(RE_EDGES, '');
}

const pad = (n: number): string => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

function isValidDate(y: number, m: number, d: number): boolean {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function addDays(iso: string, n: number): string {
    const t = new Date(`${iso}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
}

export function parseHolidayLine(rawLine: string, year: number): { date: string; name: string } | { error: LineError; found?: number } {
    const line = rawLine.trim();
    let matched: string;
    let y: number;
    let mo: number;
    let d: number;
    let m: RegExpMatchArray | null;

    if ((m = line.match(RE_YMD))) {
        matched = m[0];
        [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    } else if ((m = line.match(RE_DMY))) {
        matched = m[0];
        [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    } else if ((m = line.match(RE_THAI))) {
        const word = MONTH_WORDS.find(([w]) => w === m![2]);
        matched = m[0];
        d = Number(m[1]);
        mo = (word ? word[1] : 0) + 1;
        y = Number(m[3]);
    } else {
        return { error: 'no_date' };
    }

    if (y > 2400) {
        y -= 543;
    }
    if (!isValidDate(y, mo, d)) {
        return { error: 'bad_date' };
    }
    const name = nameAround(line, matched);
    if (!name) {
        return { error: 'no_name' };
    }
    if (y !== year) {
        return { error: 'other_year', found: y };
    }
    return { date: isoOf(y, mo, d), name };
}

type ParsedLine = { dates: string[]; name: string } | { error: LineError; found?: number };

// A line may name a run of days ("13-15 เมษายน 2569 ...") which becomes one date per day
export function parseHolidayRange(rawLine: string, year: number): ParsedLine {
    const line = rawLine.trim();
    const m = line.match(RE_THAI_RANGE);
    if (m && !line.match(RE_YMD) && !line.match(RE_DMY)) {
        const word = MONTH_WORDS.find(([w]) => w === m[3]);
        const mo = (word ? word[1] : 0) + 1;
        const [from, to] = [Number(m[1]), Number(m[2])];
        let y = Number(m[4]);
        if (y > 2400) {
            y -= 543;
        }
        if (from > to || to - from + 1 > MAX_RANGE_DAYS || !isValidDate(y, mo, from) || !isValidDate(y, mo, to)) {
            return { error: 'bad_date' };
        }
        const name = nameAround(line, m[0]);
        if (!name) {
            return { error: 'no_name' };
        }
        if (y !== year) {
            return { error: 'other_year', found: y };
        }
        return { dates: Array.from({ length: to - from + 1 }, (_, i) => isoOf(y, mo, from + i)), name };
    }

    const single = parseHolidayLine(line, year);
    return 'error' in single ? single : { dates: [single.date], name: single.name };
}

export function parseHolidayText(
    text: string,
    year: number,
    existing: string[],
): {
    ok: DateName[];
    bad: { line: number; text: string; error: string; found?: number }[];
    duplicates: number;
} {
    const ok: DateName[] = [];
    const bad: { line: number; text: string; error: string; found?: number }[] = [];
    let duplicates = 0;
    const have = new Set(existing);

    text.split(/\r\n|\r|\n/).forEach((raw, index) => {
        const line = raw.trim();
        if (!line) {
            return;
        }
        const parsed = parseHolidayRange(line, year);
        if ('error' in parsed) {
            bad.push({ line: index + 1, text: line, ...parsed });
            return;
        }
        for (const date of parsed.dates) {
            if (have.has(date)) {
                duplicates++;
                continue;
            }
            have.add(date);
            ok.push({ date, name: parsed.name });
        }
    });

    return { ok, bad, duplicates };
}

export function monthSummary(
    rows: DateName[],
    today: string,
): { month: number; items: { from: number; to: number; name: string; past: boolean; next: boolean }[] }[] {
    const sorted = rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
    let nextDate = sorted.find((r) => r.date >= today)?.date;
    const groups = new Map<number, { from: number; to: number; name: string; past: boolean; next: boolean }[]>();

    for (let i = 0; i < sorted.length; i++) {
        const first = sorted[i];
        const monthText = first.date.slice(5, 7);
        let j = i;
        // Merge consecutive days that share a name, within one month
        while (
            j + 1 < sorted.length &&
            sorted[j + 1].name === first.name &&
            sorted[j + 1].date === addDays(sorted[j].date, 1) &&
            sorted[j + 1].date.slice(5, 7) === monthText
        ) {
            j++;
        }
        const last = sorted[j];
        const month = Number(monthText);
        const items = groups.get(month) ?? [];
        const next = nextDate !== undefined && nextDate >= first.date && nextDate <= last.date;
        // Only the first row on the next holiday's date carries the mark
        if (next) nextDate = undefined;
        items.push({
            from: Number(first.date.slice(8)),
            to: Number(last.date.slice(8)),
            name: first.name,
            past: last.date < today,
            next,
        });
        groups.set(month, items);
        i = j;
    }

    return [...groups].map(([month, items]) => ({ month, items }));
}

export function fixedDateRows(previousYear: DateName[], year: number): DateName[] {
    return previousYear
        .filter((r) => r.date && FIXED_MONTH_DAYS.has(r.date.slice(5)))
        .map((r) => ({ date: `${year}-${r.date.slice(5)}`, name: r.name }));
}

export function rowErrors(rows: HolidayRow[], year: number): Record<string, RowError> {
    const out: Record<string, RowError> = {};
    const seen = new Set<string>();

    for (const row of rows) {
        const error: RowError = {};
        if (!row.date) {
            error.date = 'required';
        } else if (!row.date.startsWith(`${year}-`)) {
            error.date = 'other_year';
        } else if (seen.has(row.date)) {
            error.date = 'taken';
        }
        if (row.date) {
            seen.add(row.date);
        }
        if (!row.name.trim()) {
            error.name = 'required';
        } else if (row.name.trim().length > HOLIDAY_NAME_MAX) {
            error.name = 'too_long';
        }
        if (error.date || error.name) {
            out[row.key] = error;
        }
    }
    return out;
}

// Browser-local calendar date as YYYY-MM-DD
export function localIsoDate(now: Date): string {
    return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

// ISO weekday of a YYYY-MM-DD date: 1 = Monday … 7 = Sunday
export function isoWeekday(iso: string): number {
    const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return day === 0 ? 7 : day;
}

// Years offered on the page: earlier years that have rows, this year and next year
export function holidayYears(dates: string[], thisYear: number): number[] {
    const earlier = dates.map((date) => Number(date.slice(0, 4))).filter((year) => year < thisYear);
    return [...new Set([...earlier, thisYear, thisYear + 1])].sort((a, b) => a - b);
}

const SERVER_CODES: Record<string, RowError> = {
    holiday_date_required: { date: 'required' },
    holiday_date_other_year: { date: 'other_year' },
    holiday_date_taken: { date: 'taken' },
    holiday_name_required: { name: 'required' },
    holiday_name_too_long: { name: 'too_long' },
};

// The one 422 that belongs to the whole year rather than a row
export function tooManyHolidays(errors: Record<string, string[]>): boolean {
    return errors.holidays?.[0] === 'holiday_too_many';
}

// 422 field errors (holidays.<i>.date|name) keyed back to the rows that were sent, in order
export function serverRowErrors(errors: Record<string, string[]>, sentKeys: string[]): Record<string, RowError> {
    const out: Record<string, RowError> = {};
    for (const [field, messages] of Object.entries(errors)) {
        const match = /^holidays\.(\d+)\.(date|name)$/.exec(field);
        const key = match ? sentKeys[Number(match[1])] : undefined;
        const mapped = SERVER_CODES[messages[0] ?? ''];
        if (!match || key === undefined || !mapped) {
            continue;
        }
        const part = match[2] as 'date' | 'name';
        if (mapped[part] === undefined) {
            continue;
        }
        out[key] = { ...out[key], [part]: mapped[part] };
    }
    return out;
}
