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
