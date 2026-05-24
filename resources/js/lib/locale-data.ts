import { getData } from 'country-list';
import currencyMod from 'currency-list';
import { getTimeZones } from '@vvo/tzdb';

export interface SelectOption {
    value: string;
    label: string;
}

// Country name as value so it matches existing DB values (e.g. "Thailand")
export const countryOptions: SelectOption[] = getData()
    .map((c) => ({ value: c.name, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

// Currency code as value (e.g. "THB"), label shows code + full name
const rawCurrencies = currencyMod.currencyList['en'];
export const currencyOptions: SelectOption[] = Object.values(rawCurrencies)
    .map((c) => ({ value: c.code, label: `${c.code} – ${c.name}` }))
    .sort((a, b) => a.value.localeCompare(b.value));

// IANA timezone name as value (e.g. "Asia/Bangkok"), sorted by UTC offset
export const timezoneOptions: SelectOption[] = getTimeZones()
    .sort((a, b) => a.rawOffsetInMinutes - b.rawOffsetInMinutes)
    .map((tz) => ({ value: tz.name, label: tz.currentTimeFormat }));
