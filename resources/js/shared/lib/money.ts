// Money typed into a form: raw digits with at most one dot and 2 decimals, shown grouped while typing.

// Widest DECIMAL(15,2) money column: 13 whole digits
export const MAX_MONEY_DIGITS = 13;

/** Keeps digits and the first dot, with at most maxWholeDigits before it and 2 after ("1,234.567" → "1234.56"). */
export function sanitizeMoney(raw: string, maxWholeDigits = MAX_MONEY_DIGITS): string {
    const s = raw.replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    if (dot === -1) return s.slice(0, maxWholeDigits);
    const decimals = s
        .slice(dot + 1)
        .replace(/\./g, '')
        .slice(0, 2);
    return `${s.slice(0, Math.min(dot, maxWholeDigits))}.${decimals}`;
}

const grouping = new Map<string, Intl.NumberFormat>();

/** Groups the whole part while keeping a typed dot and decimals ("1234.5" → "1,234.5"). */
export function groupMoney(raw: string, lang: string): string {
    if (!raw) return '';
    const locale = lang === 'th' ? 'th-TH' : 'en-US';
    let format = grouping.get(locale);
    if (!format) {
        format = new Intl.NumberFormat(locale);
        grouping.set(locale, format);
    }
    const [whole, decimals] = raw.split('.');
    const grouped = whole ? format.format(Number(whole)) : '0';
    return raw.includes('.') ? `${grouped}.${decimals ?? ''}` : grouped;
}

/** A stored amount as the form's raw text with exactly 2 decimals ('' when there is none). */
export function toMoneyText(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** The padded amount back to what the user typed, so digits can be added at the end ("38500.00" → "38500", "12.50" → "12.5"). */
export function unpadMoney(raw: string): string {
    if (!raw.includes('.')) return raw;
    return raw.replace(/0+$/, '').replace(/\.$/, '');
}
