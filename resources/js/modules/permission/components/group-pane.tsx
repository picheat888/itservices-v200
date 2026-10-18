// Pieces both panes of the Role Group dialog share, so "Add members" and "Current members" line up row for row.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/** Title line, then one line of controls. */
export function PaneHeader({ id, title, meta, children }: { id: string; title: string; meta: ReactNode; children: ReactNode }) {
    return (
        <div className="grid gap-2.5 px-5 pt-3.5 pb-3">
            <div id={id} className="flex items-baseline gap-1.5 text-sm font-semibold">
                {title}
                <span className="text-muted-foreground text-[13px] font-normal">{meta}</span>
            </div>
            <div className="flex gap-2">{children}</div>
        </div>
    );
}

/** Name over code and department; `lead` sits before (a checkbox), `note` and `end` after. */
export function PaneRow({
    as: Tag = 'div',
    name,
    code,
    department,
    lead,
    note,
    end,
    changed,
    gone,
    muted,
    htmlFor,
}: {
    as?: 'div' | 'label';
    name: string;
    code: string;
    department: string | null;
    lead?: ReactNode;
    note?: string | null;
    end?: ReactNode;
    /** Joined or leaving before the save: orange name and note. */
    changed?: boolean;
    /** Leaving on save: struck through. */
    gone?: boolean;
    muted?: boolean;
    htmlFor?: string;
}) {
    return (
        <Tag
            htmlFor={Tag === 'label' ? htmlFor : undefined}
            className={cn(
                'border-border/60 flex min-h-[52px] items-center gap-3 border-b px-5 py-1.5 text-[13px]',
                Tag === 'label' && !muted && 'hover:bg-accent/50 cursor-pointer',
            )}
        >
            {lead}
            <span className="grid min-w-0">
                <span
                    className={cn(
                        'truncate font-medium',
                        changed && 'font-semibold text-orange-700 dark:text-orange-400',
                        gone && 'line-through',
                        muted && 'text-muted-foreground',
                    )}
                >
                    {name}
                </span>
                <span className="text-muted-foreground flex gap-2 truncate text-xs">
                    <span>{code}</span>
                    {department && <span className="truncate">{department}</span>}
                </span>
            </span>
            {note && (
                <span className={cn('ml-auto shrink-0 text-xs', changed ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground')}>
                    {note}
                </span>
            )}
            {end && <span className={cn('flex min-w-14 shrink-0 items-center justify-end', !note && 'ml-auto')}>{end}</span>}
        </Tag>
    );
}

/** Loading rows the height of a PaneRow. */
export function PaneSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div aria-hidden>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="border-border/60 flex min-h-[52px] items-center gap-3 border-b px-5">
                    <Skeleton className="h-4 w-4 shrink-0 rounded" />
                    <span className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-28" />
                    </span>
                </div>
            ))}
        </div>
    );
}

/** "1–20 of 38" with previous / next, at the foot of each pane. */
export function PanePager({
    page,
    lastPage,
    perPage,
    total,
    onPage,
}: {
    page: number;
    lastPage: number;
    perPage: number;
    total: number;
    onPage: (page: number) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const first = (page - 1) * perPage + 1;
    const last = Math.min(page * perPage, total);
    const button =
        'border-border hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent';
    return (
        <div className="border-border text-muted-foreground flex items-center justify-end gap-2 border-t px-5 py-2.5 text-[13px]">
            <span className="mr-1 tabular-nums">
                {fmtN(total === 0 ? 0 : first)}–{fmtN(last)} {t('cmn_of')} {fmtN(total)}
            </span>
            <button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('page_prev')}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            <b className="text-foreground font-medium tabular-nums">
                {fmtN(page)} / {fmtN(lastPage)}
            </b>
            <button type="button" className={button} disabled={page >= lastPage} onClick={() => onPage(page + 1)} aria-label={t('page_next')}>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    );
}
