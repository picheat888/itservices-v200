// Six code boxes over one real input, so typing, pasting "482 913" and screen readers all work on a single field.
import { cn } from '@/shared/lib/utils';
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
    return (
        <div className="relative flex items-center gap-2">
            {Array.from({ length: PAIR_CODE_LENGTH }, (_, i) => (
                <span
                    key={i}
                    aria-hidden
                    className={cn(
                        'grid h-12.5 w-11 place-items-center rounded-lg border text-[22px] font-semibold tabular-nums',
                        i === 3 && 'ml-2.5',
                        invalid ? 'border-destructive border-[1.5px]' : i === value.length ? 'border-brand border-2' : 'border-input',
                    )}
                >
                    {value[i] ?? ''}
                </span>
            ))}
            <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                name="monitor_code"
                aria-label={label}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                value={value}
                onChange={(e) => onChange(normalizePairCode(e.target.value))}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmit();
                }}
                className="peer absolute inset-0 w-full cursor-text text-transparent caret-transparent opacity-0 focus-visible:opacity-0"
            />
        </div>
    );
}
