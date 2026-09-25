/**
 * One labeled select field of a report filter bar: a Radix Select with an `'all'`
 * sentinel value standing in for "no filter chosen". Shared by `ticket-report-filter-bar.tsx`
 * and `tabular-filter-bar.tsx` — extracted so both bars use the same field, not a copy each.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export const FILTER_SELECT_ALL = 'all';

export function FilterSelect({
    id,
    label,
    value,
    onChange,
    items,
    anyLabel,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    items: { value: string; label: string }[];
    anyLabel: string;
}) {
    return (
        <div className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger id={id} className="h-9 w-44">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={FILTER_SELECT_ALL}>{anyLabel}</SelectItem>
                    {items.map((i) => (
                        <SelectItem key={i.value} value={i.value}>
                            {i.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
