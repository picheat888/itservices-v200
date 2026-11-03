// The monitor header's stale-data warning: after two failed polls in a row, say when the shown data is from.

const pad = (n: number) => String(n).padStart(2, '0');

export function clockTime(ms: number): string {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function connectionLabel(failures: number, lastOkAt: number | null, t: (key: string) => string): string | null {
    if (failures < 2 || lastOkAt === null) return null;
    return t('mon_offline').replace('{t}', clockTime(lastOkAt));
}
