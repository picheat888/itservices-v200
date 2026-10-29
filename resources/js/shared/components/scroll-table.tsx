// A table whose rows scroll under a fixed header strip: the scrollbar runs beside the rows only,
// and the column headers stay in the data table (visually hidden) so screen readers pair each cell with its column.
import { TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { ReactNode, Ref } from 'react';

export interface ScrollTableHead {
    label: ReactNode;
    /** Alignment and other classes of this column's header cell. */
    className?: string;
}

interface ScrollTableProps {
    /** The <col> elements; both tables share them, so give every fixed column a width. */
    cols: ReactNode;
    heads: ScrollTableHead[];
    /** Classes of every header cell (padding, border). */
    thClassName: string;
    /** Classes of the header row (text colour and size). */
    headRowClassName: string;
    /** Classes of both <table> elements; keep `table-fixed` so the columns line up. */
    tableClassName: string;
    /** The frame: border, radius, sizing within its parent. */
    className?: string;
    /** The scrolling box, for scrolling a row into view. */
    bodyRef?: Ref<HTMLDivElement>;
    /** Shown in the scrolling box under the table, e.g. an empty state. */
    after?: ReactNode;
    /** The <tbody> (and <tfoot>) of the table. */
    children: ReactNode;
}

export function ScrollTable({ cols, heads, thClassName, headRowClassName, tableClassName, className, bodyRef, after, children }: ScrollTableProps) {
    return (
        <div className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
            {/* The header strip reserves the same scrollbar gutter as the rows, so the columns line up */}
            <div aria-hidden className={cn('shrink-0 overflow-hidden [scrollbar-gutter:stable]', TABLE_HEAD)}>
                <table className={tableClassName}>
                    <colgroup>{cols}</colgroup>
                    <thead>
                        <tr className={headRowClassName}>
                            {heads.map((h, i) => (
                                <th key={i} className={cn(thClassName, h.className)}>
                                    {h.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                </table>
            </div>
            <div ref={bodyRef} className="min-h-0 overflow-auto overscroll-contain [scrollbar-gutter:stable]">
                <table className={tableClassName}>
                    <colgroup>{cols}</colgroup>
                    <thead>
                        <tr>
                            {heads.map((h, i) => (
                                <th key={i} scope="col" className="h-0 border-0 p-0">
                                    <span className="sr-only">{h.label}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    {children}
                </table>
                {after}
            </div>
        </div>
    );
}
