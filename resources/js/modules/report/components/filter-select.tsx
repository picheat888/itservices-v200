/**
 * The `'all'` sentinel a report filter select uses for "no filter chosen" — the value of the
 * "ทั้งหมด" option (filter-row.tsx useWithAllOption), mapped back to null/'' by each bar
 * (ticket-report-filter-bar.tsx, tabular-filter-bar.tsx). The labeled Radix select that once
 * lived here gave way to SearchableSelect in the one-line filter rows.
 */
export const FILTER_SELECT_ALL = 'all';
