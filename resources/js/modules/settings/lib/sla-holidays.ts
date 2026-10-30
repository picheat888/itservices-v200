// Pure helpers for the SLA holiday editor: pasted-text parser, month summary, fixed-date copy and row checks.
export type HolidayRow = { key: string; date: string; name: string };
type DateName = { date: string; name: string };
export type LineError = 'no_date' | 'bad_date' | 'no_name' | 'other_year';
export type RowError = { date?: 'required' | 'other_year' | 'taken'; name?: 'required' };

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
    const name = line.replace(matched, '').replace(/^[\s,:\-–]+|[\s,:\-–]+$/g, '');
    if (!name) {
        return { error: 'no_name' };
    }
    if (y !== year) {
        return { error: 'other_year', found: y };
    }
    return { date: isoOf(y, mo, d), name };
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

    text.split('\n').forEach((raw, index) => {
        const line = raw.trim();
        if (!line) {
            return;
        }
        const parsed = parseHolidayLine(line, year);
        if ('error' in parsed) {
            bad.push({ line: index + 1, text: line, ...parsed });
            return;
        }
        if (have.has(parsed.date)) {
            duplicates++;
            return;
        }
        have.add(parsed.date);
        ok.push(parsed);
    });

    return { ok, bad, duplicates };
}

export function monthSummary(
    rows: DateName[],
    today: string,
): { month: number; items: { from: number; to: number; name: string; past: boolean; next: boolean }[] }[] {
    const sorted = rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
    const nextDate = sorted.find((r) => r.date >= today)?.date;
    const groups = new Map<number, { from: number; to: number; name: string; past: boolean; next: boolean }[]>();

    for (let i = 0; i < sorted.length; i++) {
        const first = sorted[i];
        let j = i;
        // Merge consecutive days that share a name
        while (j + 1 < sorted.length && sorted[j + 1].name === first.name && sorted[j + 1].date === addDays(sorted[j].date, 1)) {
            j++;
        }
        const last = sorted[j];
        const month = Number(first.date.slice(5, 7));
        const items = groups.get(month) ?? [];
        items.push({
            from: Number(first.date.slice(8)),
            to: Number(last.date.slice(8)),
            name: first.name,
            past: last.date < today,
            next: nextDate !== undefined && nextDate >= first.date && nextDate <= last.date,
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
        }
        if (error.date || error.name) {
            out[row.key] = error;
        }
    }
    return out;
}
