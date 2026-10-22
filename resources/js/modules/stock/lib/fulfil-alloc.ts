// Fulfil dialog allocation: a greedy fill from the largest warehouse, refilled from fresh balances only while the user has not changed it (pure, node tests).

export type Balance = { warehouse: string; qty: number };
export type Alloc = Record<string, number>;

/** Order-independent key of the drawn quantities (zero rows ignored). */
export const allocKey = (a: Alloc): string =>
    JSON.stringify(
        Object.entries(a)
            .filter(([, n]) => n > 0)
            .sort(([x], [y]) => x.localeCompare(y)),
    );

/** Fill `qty` from the warehouses holding the most first. */
export function greedyAlloc(balances: readonly Balance[], qty: number): Alloc {
    const bals = balances.filter((b) => b.qty > 0).sort((a, b) => b.qty - a.qty);
    let remaining = qty;
    const next: Alloc = {};
    for (const b of bals) {
        if (remaining <= 0) break;
        const take = Math.min(b.qty, remaining);
        next[b.warehouse] = take;
        remaining -= take;
    }
    return next;
}

/** The new fill when fresh balances arrive and the allocation is still the seeded one; null keeps what is there. */
export function refillAlloc(alloc: Alloc, seed: Alloc, balances: readonly Balance[], qty: number): Alloc | null {
    if (allocKey(alloc) !== allocKey(seed)) {
        return null;
    }
    const next = greedyAlloc(balances, qty);
    return allocKey(next) === allocKey(seed) ? null : next;
}

/** Picks a refresh made impossible: chosen serials no longer in stock, and quantities drawn from a warehouse that is now empty. */
export function prunePicks(
    serialIds: readonly number[],
    inStockIds: readonly number[],
    alloc: Alloc,
    balances: readonly Balance[],
): { serialIds: number[]; goneSerials: number; alloc: Alloc; goneWarehouses: string[] } {
    const keptSerials = serialIds.filter((id) => inStockIds.includes(id));
    const stocked = new Set(balances.filter((b) => b.qty > 0).map((b) => b.warehouse));
    const keptAlloc: Alloc = {};
    const goneWarehouses: string[] = [];
    for (const [warehouse, qty] of Object.entries(alloc)) {
        if (qty <= 0) continue;
        if (stocked.has(warehouse)) keptAlloc[warehouse] = qty;
        else goneWarehouses.push(warehouse);
    }
    return { serialIds: keptSerials, goneSerials: serialIds.length - keptSerials.length, alloc: keptAlloc, goneWarehouses };
}
