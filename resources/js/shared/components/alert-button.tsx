// Page-level alert beside the page's main action: an outlined button (icon, words, ›) that opens the matching list.
import { cn } from '@/shared/lib/utils';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export type AlertTone = 'amber' | 'red';

const TONE: Record<AlertTone, string> = {
    amber: 'border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-50 aria-pressed:border-amber-500 aria-pressed:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:border-amber-400 dark:hover:bg-amber-500/10 dark:aria-pressed:border-amber-400 dark:aria-pressed:bg-amber-500/10',
    red: 'border-red-300 text-red-800 hover:border-red-500 hover:bg-red-50 aria-pressed:border-red-500 aria-pressed:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:border-red-400 dark:hover:bg-red-500/10 dark:aria-pressed:border-red-400 dark:aria-pressed:bg-red-500/10',
};

const ICON: Record<AlertTone, string> = {
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
};

export function AlertButton({
    tone,
    icon: Icon,
    children,
    onClick,
    pressed,
    iconClassName,
}: {
    tone: AlertTone;
    icon: LucideIcon;
    children: React.ReactNode;
    onClick: () => void;
    /** The list is already showing what this alert opens; a second press shows everything. */
    pressed?: boolean;
    iconClassName?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={cn(
                'bg-card focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border pr-2.5 pl-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                TONE[tone],
            )}
        >
            <Icon className={cn('h-4 w-4 shrink-0', ICON[tone], iconClassName)} aria-hidden />
            {children}
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
    );
}
