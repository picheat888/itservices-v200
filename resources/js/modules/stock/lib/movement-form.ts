// Return and transfer forms: per-lot return lines with the over-limit mark, the source lots a transfer can move,
// and the form field a server refusal belongs to (pure, node tests).

export type DrawnLot = { lot_id: number; left: number };
export type ReturnLine = { lot_id: number; qty: number; left: number; over: boolean };
type MovableLot = { id: number; warehouse: string; qty_remaining: number; received_at: string | null };

/** Typed quantities against what each lot can still take back; `over` blocks saving. */
export function returnLines(lots: DrawnLot[], typed: Record<number, string>) {
    const lines: ReturnLine[] = lots.map((lot) => {
        const qty = Number(typed[lot.lot_id] || 0);
        return { lot_id: lot.lot_id, qty, left: lot.left, over: qty > lot.left };
    });
    return {
        lines,
        total: lines.reduce((sum, line) => sum + line.qty, 0),
        over: lines.some((line) => line.over),
        payload: lines.filter((line) => line.qty > 0).map((line) => ({ lot_id: line.lot_id, qty: line.qty })),
    };
}

/** "Return everything left": every lot that still has something out, at its full amount. */
export function fillAllLeft(lots: DrawnLot[]): Record<number, string> {
    return Object.fromEntries(lots.filter((lot) => lot.left > 0).map((lot) => [lot.lot_id, String(lot.left)]));
}

/** Lots of the source warehouse that still hold stock, oldest first. */
export function transferLots<T extends MovableLot>(lots: T[], warehouse: string): T[] {
    if (!warehouse) return [];
    return lots
        .filter((lot) => lot.warehouse === warehouse && lot.qty_remaining > 0)
        .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? '') || a.id - b.id);
}

/** The first field a 422 names, with array entries (`lots.0.qty`) folded onto their list field. */
export function refusalField(error: unknown): string | undefined {
    const errors = (error as { response?: { status?: number; data?: { errors?: Record<string, unknown> } } })?.response?.data?.errors;
    const first = errors ? Object.keys(errors)[0] : undefined;
    return first?.split('.')[0];
}
