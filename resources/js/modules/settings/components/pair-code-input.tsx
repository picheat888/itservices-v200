// Six code boxes over one real input, so typing, pasting "482 913" and screen readers all work on a single field.
import { cn } from '@/shared/lib/utils';
import { useState } from 'react';
import { normalizePairCode, PAIR_CODE_LENGTH } from '../lib/pair-code';

interface Props {
    value: string;
    onChange: (code: string) => void;
    onSubmit: () => void;
    invalid: boolean;
    label: string;
    describedBy?: string;
}

export function PairCodeInput({ value, onChange, onSubmit, invalid, label, describedBy }: Props) {
    // The box the next digit lands in is outlined only while the field has focus
    const [focused, setFocused] = useState(false);
    const caret = Math.min(value.length, PAIR_CODE_LENGTH - 1);

    return (
        <div className="relative flex items-center gap-2">
            {Array.from({ length: PAIR_CODE_LENGTH }, (_, i) => (
                <span
                    key={i}
                    aria-hidden
                    className={cn(
                        'grid h-12.5 w-11 place-items-center rounded-lg border text-[22px] font-semibold tabular-nums',
                        i === 3 && 'ml-2.5',
                        invalid ? 'border-destructive border-[1.5px]' : focused && i === caret ? 'border-brand border-2' : 'border-input',
                        invalid && focused && i === caret && 'ring-destructive/40 ring-2',
                    )}
                >
                    {value[i] ?? ''}
                </span>
            ))}
            <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                name="monitor_code"
                aria-label={label}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                value={value}
                onChange={(e) => onChange(normalizePairCode(e.target.value))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                }}
                className="peer absolute inset-0 w-full cursor-text text-transparent caret-transparent opacity-0 focus-visible:opacity-0"
            />
        </div>
    );
}
