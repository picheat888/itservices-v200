import { actionLabel } from '@/lib/permission-labels';
import { cn } from '@/lib/utils';
import type { Lang } from '@/types';
import { Check, Lock } from 'lucide-react';

// Mirrors App\Support\Permissions::stockHierarchy() — keep in sync.
const MASTER = 'stock.module';
const GROUPS: { view: string; children: string[] }[] = [
    { view: 'stock.view_dashboard', children: [] },
    { view: 'stock.view', children: ['stock.manage_items', 'stock.receive', 'stock.return', 'stock.transfer'] },
    { view: 'stock.view_request', children: ['stock.request', 'stock.approve', 'stock.fulfill'] },
    { view: 'stock.view_count', children: ['stock.count'] },
    { view: 'stock.view_events', children: ['stock.events'] },
];
const ALL_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];

const label = (key: string, lang: Lang) => actionLabel('stock', key.replace('stock.', ''), lang);

/** True when every ancestor (master, and the group view for a child) is on. */
function hasAncestors(key: string, has: (k: string) => boolean): boolean {
    if (!has(MASTER)) {
        return false;
    }
    const parent = GROUPS.find((g) => g.children.includes(key));
    if (parent) {
        return has(parent.view);
    }
    return true;
}

/** A single toggle, matching the matrix switch (h-5 w-9). */
function Switch({ on, locked, onClick }: { on: boolean; locked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={locked}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-brand' : 'bg-muted')}
        >
            <span className={cn('absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all', on ? 'left-[1.125rem]' : 'left-0.5')}>
                {on && <Check className="text-brand h-2.5 w-2.5" />}
                {locked && !on && <Lock className="text-muted-foreground h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

/**
 * Renders the Stock permission card as a master → view → management tree with
 * cascade: turning a parent off clears + locks its children; turning a child on
 * implies its ancestors. Super is read-only (everything shown on + locked).
 */
export function StockPermissionTree({
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);
    const masterOn = has(MASTER);

    const toggle = (key: string) => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (key === MASTER) {
                    ALL_KEYS.forEach((k) => next.delete(k));
                }
                const group = GROUPS.find((g) => g.view === key);
                if (group) {
                    group.children.forEach((c) => next.delete(c));
                }
            } else {
                next.add(key);
                const parent = GROUPS.find((g) => g.children.includes(key));
                if (parent) {
                    next.add(parent.view);
                    next.add(MASTER);
                }
                if (GROUPS.some((g) => g.view === key)) {
                    next.add(MASTER);
                }
            }
            return next;
        });
    };

    const activeCount = masterOn ? ALL_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;

    return (
        <div className="border-border rounded-lg border">
            <div className="border-border flex items-center justify-between border-b px-3.5 py-2.5">
                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label(MASTER, lang)}</span>
                <span className={cn('font-mono text-[10.5px] font-bold', activeCount === 0 ? 'text-muted-foreground' : 'text-brand')}>
                    {activeCount}/{ALL_KEYS.length}
                </span>
            </div>

            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{label(MASTER, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">
                        {lang === 'th' ? 'ตัวหลัก · คุมโมดูลและไอคอนใน sidebar' : 'Master · gates the module and the sidebar icon'}
                    </div>
                </div>
                <div className="ml-auto">
                    <Switch on={masterOn} locked={isSuper} onClick={() => toggle(MASTER)} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity md:columns-2 md:gap-x-6', !masterOn && 'opacity-40')}>
                {GROUPS.map((group) => {
                    const viewOn = has(group.view) && masterOn;
                    return (
                        <div key={group.view} className="break-inside-avoid py-0.5">
                            <div className="flex min-h-[34px] items-center gap-2">
                                <span className="text-sm font-medium">{label(group.view, lang)}</span>
                                <span className="ml-auto flex items-center gap-2">
                                    <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                                        {lang === 'th' ? 'ดู' : 'View'}
                                    </span>
                                    <Switch on={viewOn} locked={isSuper || !masterOn} onClick={() => toggle(group.view)} />
                                </span>
                            </div>
                            {group.children.length > 0 && (
                                <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                                    {group.children.map((child) => (
                                        <div key={child} className="flex min-h-[30px] items-center gap-2">
                                            <span className="text-muted-foreground text-[12.5px]">{label(child, lang)}</span>
                                            <span className="ml-auto">
                                                <Switch on={has(child) && viewOn} locked={isSuper || !viewOn} onClick={() => toggle(child)} />
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
