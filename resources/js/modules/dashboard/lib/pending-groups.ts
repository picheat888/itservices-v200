// Groups the assets waiting for acceptance by model for the Dashboard strip (pure, loaded by node tests).
import type { PendingAsset } from '../api/dashboardApi';

export interface PendingGroup {
    key: string;
    model: string;
    type: string | null;
    count: number;
}

export function groupPendingAssets(rows: PendingAsset[], lang: string): PendingGroup[] {
    const groups = new Map<string, PendingGroup>();
    for (const row of rows) {
        const model = row.model ?? row.asset_code;
        // Kept inline: this file is loaded by node tests, which cannot resolve the @/ alias
        const type = lang === 'th' ? (row.category_th ?? row.category) : row.category;
        const found = groups.get(model);
        if (found) {
            found.count += 1;
        } else {
            groups.set(model, { key: model, model, type: type ?? null, count: 1 });
        }
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
}
