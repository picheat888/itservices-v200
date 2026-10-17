// One number format for the whole app: grouped thousands in th-TH / en-US, never the browser locale.
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
