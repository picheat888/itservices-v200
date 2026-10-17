// One number format for the whole app: grouped thousands in th-TH / en-US, never the browser locale.
import type { ReactNode } from 'react';

export interface NumberOptions {
    decimals?: number;
    maxDecimals?: number;
}

const cache = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, lang: string, options: NumberOptions = {}): string {
    const locale = lang === 'th' ? 'th-TH' : 'en-US';
    const min = options.decimals ?? 0;
    const max = options.decimals ?? options.maxDecimals ?? 0;
    const id = `${locale}:${min}:${max}`;
    let format = cache.get(id);
    if (!format) {
        format = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max });
        cache.set(id, format);
    }
    return format.format(value);
}

/** What a KPI figure shows: numbers and plain numeric strings get thousands separators. */
export function formatStatValue(value: ReactNode, lang: string): ReactNode {
    if (typeof value === 'number') return formatNumber(value, lang, { maxDecimals: 2 });
    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
        const decimals = value.split('.')[1]?.length ?? 0;
        return formatNumber(Number(value), lang, { decimals });
    }
    return value;
}
