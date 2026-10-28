// Fulfil preview: which lots the server will draw for a quantity from one warehouse, oldest first (pure, node tests).

export type PickableLot = { lot_id: number; lot_no: string | null; warehouse: string | null; received_at: string; remaining: number };
export type LotPick = { lot_id: number; lot_no: string | null; received_at: string; remaining: number; take: number; whole: boolean };

type OpenLot = { id: number; lot_no: string | null; warehouse: string; received_at: string | null; qty_remaining: number };

/** An item's open lots in the shape the pick preview reads (the fulfil seed and the request detail both use it). */
export function toPickableLots(item: { lots?: OpenLot[] } | undefined): PickableLot[] {
    return (item?.lots ?? []).map((l) => ({
        lot_id: l.id,
        lot_no: l.lot_no,
        warehouse: l.warehouse,
        received_at: l.received_at ?? '',
        remaining: l.qty_remaining,
    }));
}

/** Oldest lots of `warehouse` first (received_at, then id) until `qty` is covered; `whole` when a lot is taken out entirely. */
export function pickLots(lots: PickableLot[], warehouse: string, qty: number): LotPick[] {
    const picks: LotPick[] = [];
    let left = qty;

    const here = lots
        .filter((l) => l.warehouse === warehouse && l.remaining > 0)
        .sort((a, b) => a.received_at.localeCompare(b.received_at) || a.lot_id - b.lot_id);

    for (const lot of here) {
        if (left <= 0) break;
        const take = Math.min(lot.remaining, left);
        picks.push({
            lot_id: lot.lot_id,
            lot_no: lot.lot_no,
            received_at: lot.received_at,
            remaining: lot.remaining,
            take,
            whole: take === lot.remaining,
        });
        left -= take;
    }

    return picks;
}
