// Money field for add/edit forms: right aligned, up to 2 decimals while typing, padded to 2 decimals on leave.
import { groupMoney, MAX_MONEY_DIGITS, sanitizeMoney, toMoneyText, unpadMoney } from '@/shared/lib/money';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import * as React from 'react';

interface MoneyInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
    /** Raw amount text, e.g. "38500.00" (no grouping). */
    value: string;
    onValueChange: (value: string) => void;
    /** Whole digits the column holds: 13 for DECIMAL(15,2), 10 for DECIMAL(12,2). */
    maxWholeDigits?: number;
}

export function MoneyInput({ value, onValueChange, maxWholeDigits = MAX_MONEY_DIGITS, onFocus, onBlur, className, ...props }: MoneyInputProps) {
    const lang = useUiStore((s) => s.lang);
    return (
        <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            {...props}
            className={cn('text-right tabular-nums', className)}
            value={groupMoney(value, lang)}
            onChange={(e) => onValueChange(sanitizeMoney(e.target.value, maxWholeDigits))}
            onFocus={(e) => {
                if (value !== '') onValueChange(unpadMoney(value));
                onFocus?.(e);
            }}
            onBlur={(e) => {
                if (value !== '') onValueChange(toMoneyText(value));
                onBlur?.(e);
            }}
        />
    );
}
