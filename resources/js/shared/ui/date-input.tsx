import { format } from 'date-fns';
import { enUS, th } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { Calendar } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';

interface DateInputProps {
    /** ISO date-only string, e.g. "2026-07-23" (empty when unset). */
    value: string;
    /** Receives the same ISO date-only string (or "" when cleared). */
    onChange: (value: string) => void;
    id?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
}

/** Parse "YYYY-MM-DD" as a LOCAL date (no timezone shift). */
function toDate(value: string): Date | undefined {
    if (!value) {
        return undefined;
    }
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) {
        return undefined;
    }
    return new Date(y, m - 1, d);
}

/** Date field: a popover calendar; the value stays "YYYY-MM-DD" and the trigger reads it in the system date format. */
export function DateInput({
    value,
    onChange,
    id,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    disabled,
    className,
    placeholder,
}: DateInputProps) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmt = useDateFormat();
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    // When inside a modal dialog the calendar must portal INTO the dialog content
    // (pointer-events: auto) or its clicks are swallowed by the modal guard. Resolve
    // the nearest dialog on open; null → PopoverContent falls back to <body>.
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    const selected = toDate(value);

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
        }
        setOpen(next);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    id={id}
                    aria-invalid={ariaInvalid}
                    aria-describedby={ariaDescribedBy}
                    disabled={disabled}
                    className={cn(
                        'border-input bg-background flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors',
                        'hover:border-brand/50 focus:border-brand focus:ring-brand/15 focus:ring-[3px] focus:outline-hidden',
                        'data-[state=open]:border-brand data-[state=open]:ring-brand/15 data-[state=open]:ring-[3px]',
                        'disabled:hover:border-input disabled:cursor-not-allowed disabled:opacity-50',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="truncate tabular-nums">{value ? fmt.date(value) : placeholder || t('pick_date')}</span>
                    <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent container={container} align="start" className="w-auto">
                <Calendar
                    selected={selected}
                    defaultMonth={selected}
                    locale={lang === 'th' ? th : enUS}
                    onSelect={(date) => {
                        onChange(date ? format(date, 'yyyy-MM-dd') : '');
                        setOpen(false);
                    }}
                />
            </PopoverContent>
        </Popover>
    );
}
