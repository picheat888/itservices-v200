import { getData } from 'country-list';

export interface SelectOption {
    value: string;
    label: string;
    /** Offered but not choosable — say why in `note`, or the row reads as broken. */
    disabled?: boolean;
    /** Short right-aligned reason, shown beside a disabled option. */
    note?: string;
    /** Leading visual. When any option has one, every row reserves the slot so labels line up. */
    icon?: React.ReactNode;
}

// Country name as value so it matches existing DB values (e.g. "Thailand")
export const countryOptions: SelectOption[] = getData()
    .map((c) => ({ value: c.name, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label));

// Only the currencies this app actually uses. Symbol prefix makes the option
// easy to scan; currency code stays the stored value (e.g. "THB").
export const currencyOptions: SelectOption[] = [
    { value: 'THB', label: '฿ THB – Thai Baht' },
    { value: 'USD', label: '$ USD – US Dollar' },
];
