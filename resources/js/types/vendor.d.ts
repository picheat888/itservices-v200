declare module 'country-list' {
    interface CountryData {
        code: string;
        name: string;
    }
    export function getData(): CountryData[];
    export function getName(code: string): string | undefined;
    export function getCode(name: string): string | undefined;
}

declare module 'currency-list' {
    interface CurrencyInfo {
        name: string;
        name_plural: string;
        symbol: string;
        symbol_native: string;
        code: string;
        decimal_digits: number;
        rounding: number;
    }
    const mod: {
        currencyList: Record<string, Record<string, CurrencyInfo>>;
    };
    export default mod;
}
