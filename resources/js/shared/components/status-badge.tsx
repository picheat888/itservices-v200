import { cn } from '@/shared/lib/utils';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray';

const tones: Record<Tone, string> = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-destructive/10 text-destructive',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    gray: 'bg-muted text-muted-foreground',
};

// Solid dot color per tone — same hues the badge tones use for their text/dot.
const toneDots: Record<Tone, string> = {
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-destructive',
    violet: 'bg-violet-500',
    gray: 'bg-muted-foreground',
};

/** Small standalone colored dot for a named tone — used by filter dropdown options
 *  (e.g. the gray "All" entry or a status choice) to mirror the badge colors. */
export function ToneDot({ tone }: { tone: Tone }) {
    return <span className={cn('h-2 w-2 shrink-0 rounded-full', toneDots[tone])} />;
}

export function StatusBadge({
    tone = 'gray',
    color,
    dot = true,
    children,
}: {
    tone?: Tone;
    color?: string;
    /** Leading dot indicator; set false when the badge already has its own icon. */
    dot?: boolean;
    children: React.ReactNode;
}) {
    // A custom hex (e.g. from Settings -> Assets) overrides the named tone:
    // tinted background + solid text/dot, matching the design's badge style.
    if (color) {
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
                style={{ backgroundColor: `${color}22`, color }}
            >
                {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
                {children}
            </span>
        );
    }

    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>
            {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
            {children}
        </span>
    );
}
