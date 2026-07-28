import { Clock, X } from 'lucide-react';
import * as React from 'react';

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
    /** Show a ✕ inside the trigger to clear the value (e.g. optional break). */
    clearable?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** One scrollable column of the picker (hours or minutes). */
function TimeColumn({ options, selected, onPick }: { options: string[]; selected: string; onPick: (v: string) => void }) {
    const ref = React.useRef<HTMLDivElement>(null);

    // Bring the selected value into view when the popover opens.
    React.useEffect(() => {
        ref.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
    }, []);

    return (
        <div ref={ref} className="max-h-52 w-14 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
            {options.map((o) => (
                <button
                    key={o}
                    type="button"
                    data-selected={o === selected}
                    onClick={() => onPick(o)}
                    className={cn(
                        'w-full rounded-md px-2 py-1.5 text-center font-mono text-sm transition-colors',
                        o === selected ? 'bg-brand text-brand-foreground' : 'hover:bg-accent',
                    )}
                >
                    {o}
                </button>
            ))}
        </div>
    );
}

/**
 * Time field: a field-styled trigger that opens an hour/minute picker in a popover —
 * replaces the unstyled native <input type="time"> so it matches DateInput. The stored
 * value stays a plain "HH:MM" string (matching the API). The trigger keeps the canonical
 * field states and latches the brand ring while the picker is open (data-[state=open]).
 */
export function TimeInput({ value, onChange, id, disabled, className, placeholder, clearable }: TimeInputProps) {
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement>(null);
    // Inside a modal dialog the picker must portal INTO the dialog content, or its
    // clicks are swallowed by the modal guard (same trick as DateInput).
    const [container, setContainer] = React.useState<HTMLElement | null>(null);

    const [hour = '', minute = ''] = value ? value.split(':') : [];

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
                    <span className={cn('truncate', value && 'font-mono')}>{value || placeholder || '--:--'}</span>
                    <span className="flex shrink-0 items-center gap-1">
                        {clearable && value && !disabled && (
                            <span
                                role="button"
                                tabIndex={-1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange('');
                                }}
                                className="text-muted-foreground hover:text-destructive grid h-5 w-5 place-items-center rounded"
                            >
                                <X className="h-3.5 w-3.5" />
                            </span>
                        )}
                        <Clock className="h-4 w-4 shrink-0 opacity-60" />
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent container={container} align="start" className="w-auto p-0">
                <div className="divide-border flex divide-x">
                    {/* Picking an hour keeps the picker open (minute usually follows); picking a minute closes it. */}
                    <TimeColumn options={HOURS} selected={hour} onPick={(h) => onChange(`${h}:${minute || '00'}`)} />
                    <TimeColumn
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
