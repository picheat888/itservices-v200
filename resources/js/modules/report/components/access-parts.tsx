// Pieces the access report cards share: number and department words, a bar split into labelled pieces, the "สิ่งที่ต้องทำ" lines and the clickable pick rows.
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { ChevronRight } from 'lucide-react';
import type { AccessDepartment } from '../types';
import { PIECE_INK } from './chart-tones';
import { pct, W_PCT } from './percent-classes';

export type Lang = 'th' | 'en';

export const count = (n: number, lang: Lang) => n.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US');

/** A master-data or person name in the reader's language: Thai when it has one. */
export function localName(v: { name: string; name_th: string | null }, lang: Lang): string;
export function localName(v: { name: string | null; name_th: string | null } | null | undefined, lang: Lang): string | null;
export function localName(v: { name: string | null; name_th: string | null } | null | undefined, lang: Lang): string | null {
    return v ? (lang === 'th' && v.name_th) || v.name : null;
}

/** A department in the reader's language. */
export const deptName = (d: AccessDepartment, lang: Lang) => localName(d, lang);

/** The narrowest a bar may get so each piece's number still fits, by how many pieces it has. */
const MIN_W_BY_PIECES = ['min-w-0', 'min-w-7', 'min-w-14', 'min-w-[5.25rem]', 'min-w-28', 'min-w-[8.75rem]'];

export interface Piece {
    key: string;
    value: number;
    /** A FILL class. */
    fill: string;
    /** What the piece is, for its tooltip and the screen-reader sentence. */
    label: string;
    /** Shown inside instead of the count (a share, for example). */
    text?: string;
}

/**
 * A bar on the card's scale, split into pieces with their numbers inside. The track is `className`
 * (its minimum width); `minWidth` overrides how narrow the filled part may get.
 */
export function PieceBar({
    pieces,
    scale,
    className,
    minWidth,
    label,
}: {
    pieces: Piece[];
    scale: number;
    className?: string;
    minWidth?: string;
    label?: string;
}) {
    const lang = useUiStore((s) => s.lang);
    const shown = pieces.filter((p) => p.value > 0);
    const total = shown.reduce((s, p) => s + p.value, 0);

    return (
        <div className={cn('dark:bg-muted h-5 overflow-hidden rounded-full bg-slate-200', className)}>
            <div
                role="img"
                aria-label={label ?? shown.map((p) => `${p.label} ${count(p.value, lang)}`).join(', ')}
                className={cn('flex h-full gap-px', W_PCT[pct(total, scale)], minWidth ?? MIN_W_BY_PIECES[Math.min(shown.length, 5)])}
            >
                {shown.map((p) => (
                    <span
                        key={p.key}
                        title={`${p.label}: ${p.text ?? count(p.value, lang)}`}
                        className={cn(
                            'flex min-w-6 items-center justify-center font-mono text-[10.5px] font-semibold whitespace-nowrap tabular-nums',
                            PIECE_INK,
                            W_PCT[pct(p.value, total)],
                            p.fill,
                        )}
                    >
                        {p.text ?? count(p.value, lang)}
                    </span>
                ))}
            </div>
        </div>
    );
}

export type TodoTone = 'bad' | 'warn' | 'ok' | 'muted';

const TODO_INK: Record<TodoTone, string> = {
    bad: 'font-semibold text-red-700 dark:text-red-300',
    warn: 'font-semibold text-amber-700 dark:text-amber-300',
    ok: 'font-semibold text-emerald-700 dark:text-emerald-300',
    muted: 'text-muted-foreground',
};

/** The warranty / contract cards' "สิ่งที่ต้องทำ": the most pressing line in its colour, the rest small under it. */
export function TodoLines({ lines }: { lines: { tone: TodoTone; text: string }[] }) {
    if (lines.length === 0) return null;
    return (
        <div className="min-w-0 text-sm">
            <div className={TODO_INK[lines[0].tone]}>{lines[0].text}</div>
            {lines.slice(1).map((l) => (
                <div key={l.text} className="text-muted-foreground text-xs">
                    {l.text}
                </div>
            ))}
        </div>
    );
}

/** A table row that narrows the list below to itself when clicked (links inside keep their own click). */
export function pickRow(picked: boolean, onPick: (() => void) | null) {
    return {
        className: cn(
            onPick && 'group hover:bg-muted/60 cursor-pointer',
            picked && 'bg-brand/5 hover:bg-brand/10 shadow-[inset_3px_0_0_var(--color-brand)]',
        ),
        onClick: onPick
            ? (e: React.MouseEvent) => {
                  if (!(e.target as HTMLElement).closest('a')) onPick();
              }
            : undefined,
    };
}

/** The pick row's keyboard control: the count with a chevron that turns down while picked; its click bubbles to the row. */
export function PickButton({ picked, text, label }: { picked: boolean; text: string; label: string }) {
    return (
        <button
            type="button"
            aria-pressed={picked}
            aria-label={label}
            className={cn(
                'focus-visible:ring-brand inline-flex items-center gap-0.5 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
                picked ? 'text-brand' : 'text-muted-foreground group-hover:text-brand',
            )}
        >
            {text}
            <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', picked && 'rotate-90')} />
        </button>
    );
}
