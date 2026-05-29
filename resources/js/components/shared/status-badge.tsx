import { cn } from '@/lib/utils';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray';

const tones: Record<Tone, string> = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-destructive/10 text-destructive',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    gray: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ tone = 'gray', color, children }: { tone?: Tone; color?: string; children: React.ReactNode }) {
    // A custom hex (e.g. from Settings -> Assets) overrides the named tone:
    // tinted background + solid text/dot, matching the design's badge style.
    if (color) {
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${color}22`, color }}
            >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {children}
            </span>
        );
    }

    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {children}
        </span>
    );
}
