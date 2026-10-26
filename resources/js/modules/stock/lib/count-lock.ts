// The draft stock count that holds an item on any of the given warehouses, as StockCountLock refuses it (pure, node tests).
type Counting = { reference: string; warehouse: string | null };

/** The count's reference, or null when the item is free on these warehouses. An all-warehouse count (warehouse null) holds every one. */
export function countLockFor(item: { counting?: Counting[] } | undefined, warehouses: (string | null | undefined)[]): string | null {
    const names = warehouses.filter((w): w is string => !!w);
    const hold = (item?.counting ?? []).find((c) => c.warehouse === null || names.includes(c.warehouse));
    return hold?.reference ?? null;
}

/** The draft count a new count of this warehouse (null = every warehouse) would overlap, as StockCountLock::overlap refuses it. */
export function countOverlapFor(item: { counting?: Counting[] } | undefined, warehouse: string | null): string | null {
    const hold = (item?.counting ?? []).find((c) => c.warehouse === null || warehouse === null || c.warehouse === warehouse);
    return hold?.reference ?? null;
}
