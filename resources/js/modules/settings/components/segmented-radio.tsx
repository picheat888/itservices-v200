// Settings: a short set of choices as joined buttons, built on real radio inputs (one fieldset, one legend).
import { cn } from '@/shared/lib/utils';

export const SEGMENT_LEGEND = 'mb-1.5 block p-0 text-sm leading-none font-medium';

export function SegmentedRadio<T extends string>({
    name,
    legend,
    showLegend = false,
    value,
    options,
    onChange,
}: {
    name: string;
    legend: string;
    /** Show the legend as the field label; otherwise it is read by screen readers only. */
    showLegend?: boolean;
    value: T;
    options: { value: T; label: string }[];
    onChange: (next: T) => void;
}) {
    return (
        <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={showLegend ? SEGMENT_LEGEND : 'sr-only'}>{legend}</legend>
            <div className="border-input bg-background inline-flex flex-wrap gap-0.5 rounded-lg border p-[3px]">
                {options.map((o) => (
                    <label key={o.value} className="relative">
                        <input
                            type="radio"
                            name={name}
                            value={o.value}
                            checked={value === o.value}
                            onChange={() => onChange(o.value)}
                            className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                        />
                        <span
                            className={cn(
                                'text-muted-foreground peer-hover:text-foreground peer-hover:bg-accent flex h-8 items-center rounded-md px-3 text-sm font-semibold whitespace-nowrap tabular-nums transition-colors',
                                'peer-checked:bg-brand peer-checked:text-brand-foreground peer-checked:peer-hover:bg-brand peer-checked:peer-hover:text-brand-foreground',
                                'peer-focus-visible:outline-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                            )}
                        >
                            {o.label}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
