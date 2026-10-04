/**
 * Date range picker: a two-month calendar where the first click starts a range, the second
 * ends it, and nothing reaches the caller until "นำไปใช้" confirms it — so a page never
 * refetches on a half-picked or mis-clicked range. Cancel, Esc or clicking away keeps the range
 * as it was. Weekends are bold red; `maxDate` greys out (and blocks) the days after it.
 *
 * The trigger is a field reading the range short ("1 ส.ค. – 4 ต.ค. 2026", formatRangeShort) —
 * or, given `children`, the caller's own button (a "กำหนดเอง" segment, say) opens the calendar.
 * Values in and out are "YYYY-MM-DD" strings ('' when unset).
 * Used by the report filter bars, the Report Center's period switch and the ticket dashboard.
 */
import { useT } from '@/lang';
import { formatRangeShort } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';
import { format, isAfter, isSameDay, subMonths } from 'date-fns';
import { enUS, th } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { DayPicker, getDefaultClassNames, type DateRange } from 'react-day-picker';

/** Parse "YYYY-MM-DD" as a LOCAL date (no timezone shift). */
function toDate(value: string): Date | undefined {
    const [y, m, d] = value.split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : undefined;
}

const iso = (date: Date) => format(date, 'yyyy-MM-dd');

export function DateRangeInput({
    id,
    from,
    to,
    onChange,
    maxDate,
    align = 'start',
    className,
    children,
}: {
    id?: string;
    /** ISO date-only strings, e.g. "2026-08-01" ('' when no range is set yet). */
    from: string;
    to: string;
    onChange: (from: string, to: string) => void;
    /** Last pickable day; later days are greyed out (e.g. today, for ranges the API caps at today). */
    maxDate?: Date;
    align?: 'start' | 'end';
    /** The field's classes; ignored when `children` supplies the trigger. */
    className?: string;
    /** A custom trigger button in place of the field. */
    children?: React.ReactElement;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const base = getDefaultClassNames();
    const [open, setOpen] = React.useState(false);
    const [draft, setDraft] = React.useState<DateRange | undefined>();

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setDraft({ from: toDate(from), to: toDate(to) });
        }
        setOpen(next);
    };

    const pick = (day: Date) => {
        // A finished range (or none) → this click starts a new one; an earlier day restarts it too.
        if (!draft?.from || draft.to || day < draft.from) {
            setDraft({ from: day, to: undefined });
            return;
        }
        setDraft({ from: draft.from, to: day });
    };

    const apply = () => {
        if (draft?.from && draft.to) {
            onChange(iso(draft.from), iso(draft.to));
        }
        setOpen(false);
    };

    // The second month shown is the range's end (or today / maxDate when there is no range yet).
    const lastShown = toDate(to) ?? maxDate ?? new Date();
    const pickingEnd = !!draft?.from && !draft.to;
    // Mid-pick, show the start as a one-day range so it gets the edge look.
    const shown: DateRange | undefined = pickingEnd ? { from: draft?.from, to: draft?.from } : draft;
    // Saturdays and Sundays except the range's two ends (white-on-brand) and blocked days (greyed).
    const isWeekendText = (date: Date) =>
        (date.getDay() === 0 || date.getDay() === 6) &&
        !(shown?.from && isSameDay(date, shown.from)) &&
        !(shown?.to && isSameDay(date, shown.to)) &&
        !(maxDate && isAfter(date, maxDate));
    const navButton =
        'text-muted-foreground hover:text-foreground hover:bg-accent pointer-events-auto grid h-7 w-7 place-items-center rounded-md transition-colors';
    const edge = 'bg-brand/10 [&>button]:bg-brand [&>button]:hover:bg-brand [&>button]:font-medium [&>button]:text-white';
    const hint = !draft?.from ? t('date_range_pick_start') : t('date_range_pick_end');

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                {children ?? (
                    <button
                        type="button"
                        id={id}
                        className={cn(
                            'border-input bg-background flex h-10 items-center justify-between gap-2 rounded-md border px-3 text-sm transition-colors',
                            'hover:border-brand/50 focus:border-brand focus:ring-brand/15 focus:ring-[3px] focus:outline-hidden',
                            'data-[state=open]:border-brand data-[state=open]:ring-brand/15 data-[state=open]:ring-[3px]',
                            className,
                        )}
                    >
                        <span className="truncate">{from && to ? formatRangeShort(from, to, lang) : t('pick_date')}</span>
                        <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                    </button>
                )}
            </PopoverTrigger>
            <PopoverContent align={align} className="w-auto select-none">
                <DayPicker
                    mode="range"
                    numberOfMonths={2}
                    defaultMonth={subMonths(lastShown, 1)}
                    endMonth={maxDate}
                    selected={shown}
                    onSelect={(_, day) => pick(day)}
                    disabled={maxDate ? { after: maxDate } : undefined}
                    locale={lang === 'th' ? th : enUS}
                    // Weekends in bold red, like a wall calendar — both locales start the week on Sunday, so
                    // they are the first and last columns. The red is important so it also wins over the
                    // range's brand text; the range ends are left out by isWeekendText instead.
                    modifiers={{ weekend: { dayOfWeek: [0, 6] }, weekendText: isWeekendText }}
                    modifiersClassNames={{
                        weekend: '[&>button]:font-semibold',
                        weekendText: '[&>button]:text-destructive!',
                    }}
                    classNames={{
                        weekdays: cn(
                            base.weekdays,
                            '[&>th:first-child]:text-destructive [&>th:last-child]:text-destructive [&>th:first-child]:font-bold [&>th:last-child]:font-bold',
                        ),
                        months: cn(base.months, 'relative flex gap-6'),
                        month: cn(base.month, 'space-y-3'),
                        month_caption: cn(base.month_caption, 'flex h-8 items-center justify-center'),
                        caption_label: cn(base.caption_label, 'text-sm font-semibold capitalize'),
                        nav: cn(base.nav, 'pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between'),
                        button_previous: cn(base.button_previous, navButton, 'aria-disabled:pointer-events-none aria-disabled:opacity-30'),
                        button_next: cn(base.button_next, navButton, 'aria-disabled:pointer-events-none aria-disabled:opacity-30'),
                        month_grid: cn(base.month_grid, 'w-full border-collapse'),
                        weekday: cn(base.weekday, 'text-muted-foreground h-8 w-9 pb-1 text-[11px] font-normal'),
                        day: cn(base.day, 'p-0 text-center'),
                        day_button: cn(
                            base.day_button,
                            'hover:bg-accent grid h-9 w-9 place-items-center rounded-md text-sm font-normal transition-colors',
                        ),
                        range_start: cn(base.range_start, 'rounded-l-md', edge),
                        range_end: cn(base.range_end, 'rounded-r-md', edge),
                        range_middle: cn(base.range_middle, 'bg-brand/10 [&>button]:text-brand [&>button]:hover:bg-brand/15 [&>button]:rounded-none'),
                        today: cn(base.today, '[&>button]:border-brand/60 [&>button]:border'),
                        disabled: cn(base.disabled, 'opacity-35 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent'),
                        hidden: cn(base.hidden, 'invisible'),
                    }}
                    components={{
                        Chevron: ({ orientation, className: chevronClass }) =>
                            orientation === 'left' ? (
                                <ChevronLeft className={cn('h-4 w-4', chevronClass)} aria-hidden="true" />
                            ) : (
                                <ChevronRight className={cn('h-4 w-4', chevronClass)} aria-hidden="true" />
                            ),
                    }}
                />
                <div className="mt-2 flex items-center justify-between gap-4 border-t pt-3">
                    {draft?.from && draft.to ? (
                        <span className="text-sm font-medium">{formatRangeShort(iso(draft.from), iso(draft.to), lang)}</span>
                    ) : (
                        <span className="text-muted-foreground text-xs">{hint}</span>
                    )}
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                            {t('cancel')}
                        </Button>
                        <Button type="button" size="sm" disabled={!draft?.from || !draft.to} onClick={apply}>
                            {t('apply')}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
