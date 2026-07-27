import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker';

import { cn } from '@/shared/lib/utils';

/**
 * Tailwind/brand-styled month calendar (react-day-picker v10). Fully restyled via
 * `classNames` — no base CSS import — so it inherits the app's theme tokens and the
 * brand accent for the selected day. Pass `mode`, `selected`, `onSelect`, `locale`,
 * etc. straight through to DayPicker.
 */
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
    const base = getDefaultClassNames();

    return (
        <DayPicker
            showOutsideDays
            className={cn('select-none', className)}
            classNames={{
                months: cn(base.months, 'relative'),
                month: cn(base.month, 'space-y-3'),
                month_caption: cn(base.month_caption, 'flex h-8 items-center justify-center'),
                caption_label: cn(base.caption_label, 'text-sm font-semibold capitalize'),
                nav: cn(base.nav, 'absolute inset-x-0 top-0 flex items-center justify-between'),
                button_previous: cn(base.button_previous, 'text-muted-foreground hover:text-foreground hover:bg-accent grid h-7 w-7 place-items-center rounded-md transition-colors'),
                button_next: cn(base.button_next, 'text-muted-foreground hover:text-foreground hover:bg-accent grid h-7 w-7 place-items-center rounded-md transition-colors'),
                month_grid: cn(base.month_grid, 'w-full border-collapse'),
                weekdays: cn(base.weekdays),
                weekday: cn(base.weekday, 'text-muted-foreground h-8 w-9 pb-1 text-[11px] font-normal'),
                week: cn(base.week),
                day: cn(base.day, 'p-0 text-center'),
                day_button: cn(base.day_button, 'hover:bg-accent grid h-9 w-9 place-items-center rounded-md text-sm font-normal transition-colors'),
                selected: cn(base.selected, '[&>button]:bg-brand [&>button]:hover:bg-brand [&>button]:font-medium [&>button]:text-white'),
                today: cn(base.today, '[&>button]:border-brand/60 [&>button]:border'),
                outside: cn(base.outside, 'text-muted-foreground/50'),
                disabled: cn(base.disabled, 'opacity-40'),
                hidden: cn(base.hidden, 'invisible'),
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, className: chevronClass }) =>
                    orientation === 'left' ? (
                        <ChevronLeft className={cn('h-4 w-4', chevronClass)} />
                    ) : (
                        <ChevronRight className={cn('h-4 w-4', chevronClass)} />
                    ),
            }}
            {...props}
        />
    );
}
