// A table cell's date over its time, each on one line, so a long date format grows the row, not the column.
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { EMPTY_DATE, type DateValue } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';

export function DateTimeCell({ value, className }: { value: DateValue; className?: string }) {
    const fmt = useDateFormat();
    const time = fmt.time(value);

    return (
        <div data-date-cell className={cn('text-xs leading-snug', className)}>
            <div className="whitespace-nowrap">{fmt.date(value)}</div>
            {time !== EMPTY_DATE && <div className="text-muted-foreground text-[11px] whitespace-nowrap">{time}</div>}
        </div>
    );
}
