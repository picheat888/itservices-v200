// Finds a Lot number (LOT-YYYYMMDD-NNNN) in scanned or pasted text, such as a sticker link.
const LOT_CODE = /LOT-\d{8}-\d{4,}/i;

export function parseLotCode(raw: string): string | null {
    const found = raw.match(LOT_CODE);
    return found ? found[0].toUpperCase() : null;
}
