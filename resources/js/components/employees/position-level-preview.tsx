import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import type { Position } from '@/types';
import { Layers } from 'lucide-react';
import { useMemo } from 'react';

/**
 * Read-only "org ladder" preview of positions grouped by level. Opened from a
 * Preview button on the Positions tab — it visualizes the level hierarchy
 * (highest rank first on a shared spine) without touching the underlying CRUD
 * table. View-only: no add/edit/delete here.
 */
export function PositionLevelPreview({
    open,
    onClose,
    positions,
}: {
    open: boolean;
    onClose: () => void;
    positions: Position[];
}) {
    const t = useT();

    // Group by level, highest first; positions inside a tier sorted by title.
    const tiers = useMemo(() => {
        const map = new Map<number, Position[]>();
        for (const p of positions) {
            const lv = p.level ?? 0;
            (map.get(lv) ?? map.set(lv, []).get(lv)!).push(p);
        }
        return [...map.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([level, items]) => ({ level, items: [...items].sort((a, b) => a.title.localeCompare(b.title)) }));
    }, [positions]);

    let cardIndex = 0;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-brand" />
                        {t('pos_level_preview')}
                    </DialogTitle>
                </DialogHeader>

                {/* Count chips */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">
                        <span className="font-mono">{positions.length}</span>
                        {t('sub_positions')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">
                        <Layers className="h-3 w-3" />
                        <span className="font-mono">{tiers.length}</span>
                        {t('pos_tiers')}
                    </span>
                </div>

                {tiers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-muted-foreground">
                            <Layers className="h-6 w-6" />
                        </div>
                        <p className="text-sm text-muted-foreground">{t('pos_empty')}</p>
                    </div>
                ) : (
                    <div className="relative max-h-[65vh] overflow-y-auto pr-1">
                        {/* The ladder spine — a vertical rail the tier badges hang on. */}
                        <span
                            aria-hidden
                            className="pointer-events-none absolute top-6 bottom-6 left-6 z-0 w-px"
                            style={{ background: 'linear-gradient(to bottom, color-mix(in srgb, var(--brand) 45%, transparent), var(--border))' }}
                        />

                        <div className="relative z-10 space-y-6">
                            {tiers.map((tier) => (
                                <div key={tier.level} className="flex gap-4">
                                    {/* Level rail — big mono numeral, tint scales with the level. */}
                                    <div className="flex w-12 shrink-0 flex-col items-center gap-1.5">
                                        <div
                                            className="grid h-12 w-12 place-items-center rounded-xl border font-mono text-xl font-bold text-brand shadow-sm"
                                            style={{
                                                backgroundColor: `color-mix(in srgb, var(--brand) ${5 + tier.level * 4}%, var(--card))`,
                                                borderColor: `color-mix(in srgb, var(--brand) ${22 + tier.level * 5}%, transparent)`,
                                            }}
                                        >
                                            {tier.level || '—'}
                                        </div>
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                            {t('pos_level_abbr')}
                                        </span>
                                    </div>

                                    {/* Positions in this tier */}
                                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                                        {tier.items.map((p) => {
                                            const delay = `${Math.min(cardIndex++, 18) * 35}ms`;
                                            return (
                                                <div
                                                    key={p.id}
                                                    className="animate-in fade-in-0 slide-in-from-bottom-2 relative overflow-hidden rounded-lg border border-border bg-card p-3 duration-300"
                                                    style={{ animationDelay: delay, animationFillMode: 'backwards' }}
                                                >
                                                    {/* Accent edge keyed to the tier */}
                                                    <span
                                                        aria-hidden
                                                        className="absolute inset-y-0 left-0 w-1"
                                                        style={{ backgroundColor: `color-mix(in srgb, var(--brand) ${30 + tier.level * 5}%, transparent)` }}
                                                    />
                                                    <div className="pl-2">
                                                        <div className="truncate font-semibold leading-tight">{p.title}</div>
                                                        <div className="mt-1 font-mono text-xs text-muted-foreground">{p.code}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
