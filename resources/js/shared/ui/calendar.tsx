import { format, setMonth, setYear, type Locale } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';

import { cn } from '@/shared/lib/utils';

const MIN_YEAR = 1970;
const MAX_YEAR = new Date().getFullYear() + 10;
const YEARS_PER_PAGE = 12;

type View = 'days' | 'months' | 'years';

interface CalendarProps {
    /** Currently selected day (single-date). */
    selected?: Date;
    /** Fired when a day is picked (undefined when cleared). */
    onSelect?: (date: Date | undefined) => void;
    /** date-fns locale for month/weekday names. */
    locale?: Locale;
    /** Month shown on first open (defaults to the selected day or today). */
    defaultMonth?: Date;
    className?: string;
}

/** A month/year cell button shared by the months and years grids. */
function GridCell({ label, active, current, disabled, onClick }: { label: string; active?: boolean; current?: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'grid h-10 place-items-center rounded-md text-sm capitalize transition-colors',
                'hover:bg-accent disabled:pointer-events-none disabled:opacity-30',
                active ? 'bg-brand hover:bg-brand font-medium text-white' : current ? 'border-brand/60 border font-medium' : 'text-foreground',
            )}
        >
            {label}
        </button>
    );
}

/** Header bar (a clickable title + prev/next paging) for the months and years views. */
function ViewHeader({ title, onTitleClick, onPrev, onNext, prevDisabled, nextDisabled }: { title: string; onTitleClick?: () => void; onPrev: () => void; onNext: () => void; prevDisabled?: boolean; nextDisabled?: boolean }) {
    const arrow = 'text-muted-foreground hover:text-foreground hover:bg-accent grid h-7 w-7 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30';
    return (
        <div className="mb-2 flex h-8 items-center justify-between">
            <button type="button" onClick={onPrev} disabled={prevDisabled} className={arrow} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={onTitleClick}
                disabled={!onTitleClick}
                className="hover:text-brand rounded-md px-2 py-1 text-sm font-semibold transition-colors disabled:pointer-events-none"
            >
                {title}
            </button>
            <button type="button" onClick={onNext} disabled={nextDisabled} className={arrow} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
            </button>
        </div>
    );
}

/**
 * Tailwind/brand single-date calendar (react-day-picker v10) with a zoomable caption:
 * click the caption to zoom OUT day → months grid → years grid, click a cell to zoom
 * back IN. No base CSS import — fully restyled via classNames + theme tokens.
 */
export function Calendar({ selected, onSelect, locale, defaultMonth, className }: CalendarProps) {
    const base = getDefaultClassNames();
    const today = new Date();

    // The month currently shown in the day view; also the anchor for the grids.
    const [month, setMonthState] = React.useState<Date>(() => defaultMonth ?? selected ?? today);
    const [view, setView] = React.useState<View>('days');
    // First year of the visible years-grid page.
    const [yearPage, setYearPage] = React.useState<number>(() => month.getFullYear() - (month.getFullYear() % YEARS_PER_PAGE));

    const viewYear = month.getFullYear();

    return (
        <div className={cn('w-[252px] select-none', className)}>
            {view === 'days' && (
                <DayPicker
                    mode="single"
                    showOutsideDays
                    month={month}
                    onMonthChange={setMonthState}
                    selected={selected}
                    onSelect={onSelect}
                    locale={locale}
                    captionLayout="label"
                    classNames={{
                        months: cn(base.months, 'relative'),
                        month: cn(base.month, 'space-y-3'),
                        month_caption: cn(base.month_caption, 'flex h-8 items-center justify-center'),
                        caption_label: cn(base.caption_label, 'text-sm font-semibold capitalize'),
                        nav: cn(base.nav, 'pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between'),
                        button_previous: cn(base.button_previous, 'text-muted-foreground hover:text-foreground hover:bg-accent pointer-events-auto grid h-7 w-7 place-items-center rounded-md transition-colors'),
                        button_next: cn(base.button_next, 'text-muted-foreground hover:text-foreground hover:bg-accent pointer-events-auto grid h-7 w-7 place-items-center rounded-md transition-colors'),
                        month_grid: cn(base.month_grid, 'w-full border-collapse'),
                        weekday: cn(base.weekday, 'text-muted-foreground h-8 w-9 pb-1 text-[11px] font-normal'),
                        day: cn(base.day, 'p-0 text-center'),
                        day_button: cn(base.day_button, 'hover:bg-accent grid h-9 w-9 place-items-center rounded-md text-sm font-normal transition-colors'),
                        selected: cn(base.selected, '[&>button]:bg-brand [&>button]:hover:bg-brand [&>button]:font-medium [&>button]:text-white'),
                        today: cn(base.today, '[&>button]:border-brand/60 [&>button]:border'),
                        outside: cn(base.outside, 'text-muted-foreground/50'),
                        disabled: cn(base.disabled, 'opacity-40'),
                        hidden: cn(base.hidden, 'invisible'),
                    }}
                    components={{
                        // The caption becomes a button that zooms out to the months grid.
                        CaptionLabel: (labelProps) => (
                            <button
                                type="button"
                                onClick={() => setView('months')}
                                className="hover:text-brand rounded-md px-2 py-1 text-sm font-semibold capitalize transition-colors"
                            >
                                {labelProps.children}
                            </button>
                        ),
                        Chevron: ({ orientation, className: chevronClass }) =>
                            orientation === 'left' ? <ChevronLeft className={cn('h-4 w-4', chevronClass)} /> : <ChevronRight className={cn('h-4 w-4', chevronClass)} />,
                    }}
                />
            )}

            {view === 'months' && (
                <div>
                    <ViewHeader
                        title={String(viewYear)}
                        onTitleClick={() => {
                            setYearPage(viewYear - (viewYear % YEARS_PER_PAGE));
                            setView('years');
                        }}
                        onPrev={() => setMonthState(setYear(month, viewYear - 1))}
                        onNext={() => setMonthState(setYear(month, viewYear + 1))}
                        prevDisabled={viewYear <= MIN_YEAR}
                        nextDisabled={viewYear >= MAX_YEAR}
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                        {Array.from({ length: 12 }, (_, i) => (
                            <GridCell
                                key={i}
                                label={format(new Date(viewYear, i, 1), 'MMM', { locale })}
                                active={selected?.getFullYear() === viewYear && selected?.getMonth() === i}
                                current={today.getFullYear() === viewYear && today.getMonth() === i}
                                onClick={() => {
                                    setMonthState(setMonth(month, i));
                                    setView('days');
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {view === 'years' && (
                <div>
                    <ViewHeader
                        title={`${yearPage} – ${yearPage + YEARS_PER_PAGE - 1}`}
                        onPrev={() => setYearPage((p) => p - YEARS_PER_PAGE)}
                        onNext={() => setYearPage((p) => p + YEARS_PER_PAGE)}
                        prevDisabled={yearPage <= MIN_YEAR}
                        nextDisabled={yearPage + YEARS_PER_PAGE > MAX_YEAR}
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                        {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPage + i).map((y) => (
                            <GridCell
                                key={y}
                                label={String(y)}
                                active={selected?.getFullYear() === y}
                                current={today.getFullYear() === y}
                                disabled={y < MIN_YEAR || y > MAX_YEAR}
                                onClick={() => {
                                    setMonthState(setYear(month, y));
                                    setView('months');
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
