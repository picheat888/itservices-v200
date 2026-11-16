// How a lot's warehouse reads: real warehouses by name, stock not yet placed in one in the reader's words.

/** The warehouse name the server gives stock not yet placed in a warehouse (StockItemResource and the returnable lots). */
export const UNASSIGNED_WAREHOUSE = 'Unassigned';

/** The name to show; `unassigned` is the reader's words for the sentinel (stock_lot_unassigned). */
export const warehouseLabel = (name: string, unassigned: string): string => (name === UNASSIGNED_WAREHOUSE ? unassigned : name);
