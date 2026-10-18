// Column classes for a row of report KPI tiles (callers add `grid grid-cols-2`): no empty slot on iPad portrait or landscape.

/** Columns on wide screens by tile count — static classes, so Tailwind sees each one. */
const WIDE_COLUMNS: Record<number, string> = {
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    // 1024px: three tiles over two wider ones
    5: 'lg:grid-cols-6 xl:grid-cols-5 lg:max-xl:[&>*]:col-span-2 lg:max-xl:[&>:nth-child(n+4)]:col-span-3',
};
/** Two columns below 1024px: an odd last tile takes the whole row. */
const ODD_LAST_WIDE = 'max-lg:[&>:last-child:nth-child(odd)]:col-span-2';

export const summaryColumns = (tiles: number): string => `${WIDE_COLUMNS[tiles] ?? 'lg:grid-cols-4'} ${ODD_LAST_WIDE}`;
