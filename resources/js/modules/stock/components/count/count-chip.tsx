// A filter chip with its count for the count dialogs; aria-pressed carries the selection, not colour alone.
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';

export function CountChip({ label, count, selected, onClick }: { label: string; count: number; selected: boolean; onClick: () => void }) {
    const fmtN = useNumberFormat();
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                'focus-visible:ring-brand/40 flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden',
                selected ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
        >
            {label}
            <span className="font-semibold tabular-nums">{fmtN(count)}</span>
        </button>
    );
}
