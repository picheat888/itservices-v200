// Priority choice shared by Take case and Assign: one pressed pill out of four.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { TicketPriority } from '@/shared/types';
import { TICKET_PRIORITY_META } from './ticket-meta';

const PRIORITIES: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

export function PriorityPicker({ value, onChange, label }: { value: TicketPriority; onChange: (p: TicketPriority) => void; label: string }) {
    const t = useT();
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
                <button
                    key={p}
                    type="button"
                    aria-pressed={value === p}
                    onClick={() => onChange(p)}
                    className={cn(
                        'focus-visible:ring-ring rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        value === p ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
                    )}
                >
                    {t(TICKET_PRIORITY_META[p].key)}
                </button>
            ))}
        </div>
    );
}
