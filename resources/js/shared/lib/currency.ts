// Display symbols for the currencies the app supports (see currencyOptions in
// locale-data.ts). Keep in sync with AppSetting::currencySymbol() on the backend.
const CURRENCY_SYMBOLS: Record<string, string> = {
    THB: '฿',
    USD: '$',
};

/** Returns the display symbol for a currency code, falling back to the code itself. */
export function currencySymbol(code: string | undefined | null): string {
    if (!code) return '฿';
    return CURRENCY_SYMBOLS[code] ?? code;
}

const CYCLE_SUFFIX_KEYS: Record<string, string> = {
    monthly: 'contract_per_month',
    quarterly: 'contract_per_quarter',
    yearly: 'contract_per_year',
};

/** An amount followed by what one payment covers ("/mo", "/เดือน"); an amount with no cycle as it is. */
export function perCycle(amount: string, cycle: string | null | undefined, t: (key: string) => string): string {
    const key = cycle ? CYCLE_SUFFIX_KEYS[cycle] : undefined;
    return key ? `${amount}${t(key)}` : amount;
}
