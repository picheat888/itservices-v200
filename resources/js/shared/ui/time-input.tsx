// Time field: a field-styled trigger that opens an hour and minute picker; the value stays a plain "HH:MM" string.
import { Clock, X } from 'lucide-react';
import * as React from 'react';

import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

interface TimeInputProps {
    /** "HH:MM" 24-hour string (empty when unset). */
    value: string;
    /** Receives the same "HH:MM" string (or "" when cleared). */
    onChange: (value: string) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
    /** Show a clear button beside the value (e.g. optional break). */
    clearable?: boolean;
    /** Red border and aria-invalid, for a field with an error. */
    invalid?: boolean;
    /** Id(s) of the hint or error text that describes the field. */
    ariaDescribedBy?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** One column of the picker: a listbox that arrow keys, Home and End move through. */
function TimeColumn({
    label,
    options,
    selected,
    onPick,
    autoFocus,
}: {
    label: string;
    options: string[];
    selected: string;
    onPick: (v: string) => void;
    autoFocus?: boolean;
}) {
    const ref = React.useRef<HTMLDivElement>(null);
    const current = options.includes(selected) ? selected : options[0];

    // Bring the selected value into view (and focus it in the first column) when the picker opens.
    React.useEffect(() => {
        const el = ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? ref.current?.querySelector<HTMLButtonElement>('button');
        el?.scrollIntoView({ block: 'center' });
        if (autoFocus) el?.focus({ preventScroll: true });
    }, [autoFocus]);

    const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: buttons.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const target = buttons[Math.max(0, Math.min(buttons.length - 1, next))];
        target?.focus();
        target?.scrollIntoView({ block: 'nearest' });
    };

    return (
        <div className="min-w-0">
            <div className="text-muted-foreground border-border border-b px-2 py-1.5 text-center text-xs font-semibold">{label}</div>
            <div
                ref={ref}
                role="listbox"
                aria-label={label}
                onKeyDown={move}
                className="flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {options.map((o) => (
                    <button
                        key={o}
                        type="button"
                        role="option"
                        aria-selected={o === selected}
                        tabIndex={o === current ? 0 : -1}
                        onClick={() => onPick(o)}
                        className={cn(
                            'h-9 w-full shrink-0 rounded-md text-center text-sm tabular-nums transition-colors',
                            'focus-visible:ring-brand focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset',
                            o === selected ? 'bg-brand text-brand-foreground font-semibold' : 'hover:bg-accent',
                        )}
                    >
                        {o}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function TimeInput({ value, onChange, id, disabled, className, placeholder, clearable, invalid, ariaDescribedBy }: TimeInputProps) {
    const t = useT();
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    // Inside a modal dialog the picker must portal INTO the dialog content, or its clicks are swallowed by the modal guard.
    const [container, setContainer] = React.useState<HTMLElement | null>(null);

    const [hour = '', minute = ''] = value ? value.split(':') : [];
    const showClear = clearable && !!value && !disabled;

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
        }
        setOpen(next);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <div className={cn('relative', className)}>
                <PopoverTrigger asChild>
                    <button
                        ref={triggerRef}
                        type="button"
                        id={id}
                        disabled={disabled}
                        aria-invalid={invalid || undefined}
                        aria-describedby={ariaDescribedBy}
                        className={cn(
                            'border-input bg-background flex h-10 w-full items-center rounded-md border px-3 text-sm tabular-nums transition-colors',
                            'hover:border-brand/50 focus:border-brand focus:ring-brand/15 focus:ring-[3px] focus:outline-hidden',
                            'data-[state=open]:border-brand data-[state=open]:ring-brand/15 data-[state=open]:ring-[3px]',
                            'disabled:hover:border-input disabled:cursor-not-allowed disabled:opacity-50',
                            invalid && 'border-destructive focus:border-destructive focus:ring-destructive/25',
                            showClear ? 'pr-16' : 'pr-9',
                            !value && 'text-muted-foreground',
                        )}
                    >
                        <span className="truncate">{value || placeholder || '--:--'}</span>
                    </button>
                </PopoverTrigger>
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <Clock className="text-muted-foreground h-4 w-4" aria-hidden />
                </span>
                {showClear && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        aria-label={t('time_clear')}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 absolute inset-y-0 right-8 my-auto grid h-6 w-6 place-items-center rounded transition-colors"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                )}
            </div>
            <PopoverContent container={container} align="start" className="w-40 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="divide-border grid grid-cols-2 divide-x">
                    {/* Picking an hour keeps the picker open (a minute usually follows); picking a minute closes it. */}
                    <TimeColumn label={t('time_hour')} options={HOURS} selected={hour} onPick={(h) => onChange(`${h}:${minute || '00'}`)} autoFocus />
                    <TimeColumn
                        label={t('time_minute')}
                        options={MINUTES}
                        selected={minute}
                        onPick={(m) => {
                            onChange(`${hour || '08'}:${m}`);
                            setOpen(false);
                        }}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
