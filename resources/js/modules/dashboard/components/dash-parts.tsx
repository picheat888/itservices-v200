// Dashboard building blocks: section heading, linked tile, tile footers, card link, horizontal bar row and row animation.
import { useT } from '@/lang';
import { KpiTile, Sparkline } from '@/modules/report';
import { dialogPushedState } from '@/shared/hooks/use-dialog-param';
import { rowDelay } from '@/shared/lib/row-in';
import { cn } from '@/shared/lib/utils';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Link, type To } from 'react-router-dom';

export const TILE_GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5';
export const PAIR_GRID = 'grid gap-3 xl:grid-cols-5';
export const WIDE = 'flex min-w-0 flex-col xl:col-span-3';
export const NARROW = 'flex min-w-0 flex-col xl:col-span-2';
export const LIST_LIMIT = 5;

/** A link that opens a dialog ("?dialog=…") pushes history, so Back closes it instead of leaving the page. */
const stateFor = (to: To) => (typeof to === 'string' && to.startsWith('?') ? dialogPushedState() : undefined);

export { rowDelay };

/** Section heading: the sidebar's module icon, the title, a note, and a "go to" link when the reader may go there. */
export function SectionHeading({
    id,
    icon: Icon,
    title,
    note,
    link,
}: {
    id: string;
    icon: LucideIcon;
    title: string;
    note?: string;
    link?: { to: To; label: string; state?: unknown } | null;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
                <Icon aria-hidden className="text-muted-foreground h-[18px] w-[18px] shrink-0" />
                <h2 id={id} className="text-base font-semibold">
                    {title}
                </h2>
                {note && <span className="text-muted-foreground text-xs">{note}</span>}
            </div>
            {link && (
                <Link
                    to={link.to}
                    state={link.state}
                    className="text-brand focus-visible:ring-ring inline-flex items-center gap-0.5 rounded-sm text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {link.label}
                    <ChevronRight aria-hidden className="h-4 w-4" />
                </Link>
            )}
        </div>
    );
}

type TileProps = React.ComponentProps<typeof KpiTile> & { to?: To | null; state?: unknown };

/** A KpiTile that opens where its number comes from; a plain tile when the reader may not go there. */
export function DashTile({ to, state, className, ...tile }: TileProps) {
    if (!to) return <KpiTile {...tile} className={cn('h-full', className)} />;

    return (
        <Link
            to={to}
            state={state ?? stateFor(to)}
            className="group focus-visible:ring-ring block h-full rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        >
            <KpiTile {...tile} className={cn('group-hover:border-brand/40 h-full transition-colors', className)} />
        </Link>
    );
}

export interface LegendItem {
    key: string;
    label: string;
    value: number;
    dot: string;
    /** Opens the list of just this piece; only on a tile that has no link of its own. */
    to?: To | null;
}

/** The legend under a tile's bar: dot, label, and the count in ink. */
export function LegendFooter({ items }: { items: LegendItem[] }) {
    return (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
            {items.map((item) => {
                const body = (
                    <>
                        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', item.dot)} />
                        {item.label}
                        <span className="text-foreground font-semibold tabular-nums">{item.value}</span>
                    </>
                );
                return item.to ? (
                    <Link
                        key={item.key}
                        to={item.to}
                        state={stateFor(item.to)}
                        className="focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                        {body}
                    </Link>
                ) : (
                    <span key={item.key} className="inline-flex items-center gap-1">
                        {body}
                    </span>
                );
            })}
        </span>
    );
}

/** Footer text with the 14-day sparkline at the bottom right. */
export function SparkFooter({ text, values, className }: { text: React.ReactNode; values: number[]; className: string }) {
    return (
        <span className="flex items-end justify-between gap-2">
            <span className="min-w-0">{text}</span>
            <Sparkline values={values} className={className} />
        </span>
    );
}

/** ▲/▼ change against an earlier figure; `upIsBad` turns a rise red (a growing backlog). */
export function Delta({ value, upIsBad = false, label }: { value: number; upIsBad?: boolean; label?: string }) {
    const tone =
        value === 0 ? 'text-muted-foreground' : value > 0 === upIsBad ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400';

    return (
        <span className={cn('font-semibold tabular-nums', tone)}>
            {value > 0 ? '▲' : value < 0 ? '▼' : '±'} {Math.abs(value)}
            {label && <span className="text-muted-foreground ml-1 font-normal">{label}</span>}
        </span>
    );
}

/** Footer link that leaves the card for the full list: left-aligned brand text, chevron at the end. */
export function CardLink({ to, total, shown, label }: { to: To; total: number; shown: number; label?: string }) {
    const t = useT();

    return (
        <Link
            to={to}
            state={stateFor(to)}
            className="border-border/60 text-brand hover:bg-accent focus-visible:ring-ring mt-auto flex items-center justify-between gap-2 border-t border-dashed px-5 py-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
            {label ?? (total > shown ? t('dash_view_all_n').replace('{n}', String(total)) : t('dash_view_all'))}
            <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
        </Link>
    );
}

/** One horizontal bar row: label, bar against a shared scale, count. */
export function HBarRow({
    label,
    value,
    scale,
    fill,
    index,
    strong,
    muted,
    to,
}: {
    label: string;
    value: number;
    scale: number;
    fill: string;
    index: number;
    strong?: boolean;
    muted?: boolean;
    to?: To | null;
}) {
    const body = (
        <>
            <span className={cn('w-32 shrink-0 truncate text-sm', strong && 'font-semibold', muted && 'text-muted-foreground')} title={label}>
                {label}
            </span>
            <span className="dark:bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className={cn('block h-full rounded-full', fill)} style={{ width: `${scale > 0 ? (value / scale) * 100 : 0}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{value}</span>
        </>
    );

    return (
        <li className={cn('row-in', strong && 'border-border/60 border-b border-dashed pb-2')} style={rowDelay(index)}>
            {to ? (
                <Link
                    to={to}
                    className="hover:bg-accent/50 focus-visible:ring-ring -mx-2 flex items-center gap-3 rounded-sm px-2 py-0.5 focus-visible:ring-2 focus-visible:outline-none"
                >
                    {body}
                </Link>
            ) : (
                <div className="flex items-center gap-3 py-0.5">{body}</div>
            )}
        </li>
    );
}
