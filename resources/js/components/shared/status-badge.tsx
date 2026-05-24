import { cn } from '@/lib/utils';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray';

const tones: Record<Tone, string> = {
    blue: 'bg-brand/10 text-brand',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-destructive/10 text-destructive',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    gray: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {children}
        </span>
    );
}
