import { useT } from '@/lib/i18n';
import { actionLabel, isLivePermission, moduleLabel } from '../lib/permission-labels';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';

/**
 * Master-row behaviour for a card:
 * - `key`: a real permission key gates the card (and the sidebar). Turning it
 *   off clears + locks the remaining (child) keys; turning a child on implies it.
 * - `select-all`: a synthetic bulk toggle (the module has no single gate key —
 *   the sidebar shows when *any* child is on). Children stay independently
 *   editable; the master just flips them all on/off at once.
 */
export type ModuleMaster = { mode: 'key'; key: string } | { mode: 'select-all' };

/** A single toggle, matching the matrix / stock-tree switch (h-5 w-9). */
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
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="text-brand h-2.5 w-2.5" />}
                {locked && !on && <Lock className="text-muted-foreground h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

/** Header strip: uppercase module name + active/total count. */
function CardHeader({ title, on, total }: { title: string; on: number; total: number }) {
    return (
        <div className="border-border flex items-center justify-between border-b px-3.5 py-2.5">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</span>
            <span className={cn('font-mono text-[10.5px] font-bold', on === 0 ? 'text-muted-foreground' : 'text-brand')}>
                {on}/{total}
            </span>
        </div>
    );
}

/** Brand-tinted identity band: title + subtitle on the left, master switch on the right. */
function MasterBand({ title, subtitle, on, locked, onToggle }: { title: string; subtitle: string; on: boolean; locked: boolean; onToggle: () => void }) {
    return (
        <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
            <div className="min-w-0">
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-muted-foreground text-[10.5px]">{subtitle}</div>
            </div>
            <div className="ml-auto">
                <Switch on={on} locked={locked} onClick={onToggle} />
            </div>
        </div>
    );
}

/** A single permission row (label + optional coming-soon tag + switch). */
function PermissionRow({ label, comingSoon, on, locked, onToggle }: { label: string; comingSoon: boolean; on: boolean; locked: boolean; onToggle: () => void }) {
    const t = useT();
    return (
        <div className="flex min-h-[34px] items-center gap-2 py-0.5">
            <span className={cn('text-sm', on ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                {label}
                {comingSoon && <span className="ml-1 text-[11px] italic opacity-70">({t('coming_soon_tag')})</span>}
            </span>
            <span className="ml-auto">
                <Switch on={on} locked={locked} onClick={onToggle} />
            </span>
        </div>
    );
}

/**
 * A flat permission card styled to mirror the Stock module card: header strip,
 * a brand-tinted identity band with a master switch, then the permission list.
 * The master switch works in one of two modes (see {@link ModuleMaster}).
 * Super is read-only (live keys shown on + locked).
 */
export function ModulePermissionCard({
    module,
    keys,
    subtitle,
    master,
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    module: string;
    keys: string[];
    subtitle: { en: string; th: string };
    master: ModuleMaster;
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);
    const sub = lang === 'th' ? subtitle.th : subtitle.en;
    const label = (key: string) => {
        const [mod, action] = key.split('.');
        return actionLabel(mod, action, lang);
    };

    // ── Real-master mode: one key gates the rest (cascade), like Stock ──────────
    if (master.mode === 'key') {
        const masterKey = master.key;
        const children = keys.filter((k) => k !== masterKey);
        const masterOn = has(masterKey);
        const activeCount = masterOn ? keys.filter((k) => isLivePermission(k) && has(k)).length : 0;

        const toggleMaster = () => {
            if (isSuper) {
                return;
            }
            setDraft((prev) => {
                const next = new Set(prev);
                if (next.has(masterKey)) {
                    // Turning the gate off clears every child it was guarding.
                    next.delete(masterKey);
                    children.forEach((c) => next.delete(c));
                } else {
                    next.add(masterKey);
                }
                return next;
            });
        };

        const toggleChild = (key: string) => {
            if (isSuper || !masterOn || !isLivePermission(key)) {
                return;
            }
            setDraft((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                    next.delete(key);
                } else {
                    next.add(key);
                    next.add(masterKey); // a child implies its gate
                }
                return next;
            });
        };

        return (
            <div className="border-border rounded-lg border">
                <CardHeader title={moduleLabel(module, lang)} on={activeCount} total={keys.length} />
                <MasterBand title={label(masterKey)} subtitle={sub} on={masterOn} locked={isSuper} onToggle={toggleMaster} />
                <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                    {children.map((key) => {
                        const live = isLivePermission(key);
                        return (
                            <PermissionRow
                                key={key}
                                label={label(key)}
                                comingSoon={!live}
                                on={live && masterOn && has(key)}
                                locked={isSuper || !masterOn || !live}
                                onToggle={() => toggleChild(key)}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Select-all mode: synthetic bulk toggle, children stay independent ───────
    const liveKeys = keys.filter((k) => isLivePermission(k));
    const allOn = liveKeys.length > 0 && liveKeys.every((k) => has(k));
    const onCount = keys.filter((k) => isLivePermission(k) && has(k)).length;

    const toggleAll = () => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (liveKeys.every((k) => next.has(k))) {
                liveKeys.forEach((k) => next.delete(k)); // all on → clear all (hides the sidebar entry)
            } else {
                liveKeys.forEach((k) => next.add(k)); // → grant every section
            }
            return next;
        });
    };

    const toggleOne = (key: string) => {
        if (isSuper || !isLivePermission(key)) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    return (
        <div className="border-border rounded-lg border">
            <CardHeader title={moduleLabel(module, lang)} on={onCount} total={keys.length} />
            <MasterBand title={moduleLabel(module, lang)} subtitle={sub} on={allOn} locked={isSuper} onToggle={toggleAll} />
            <div className="px-3.5 py-1">
                {keys.map((key) => {
                    const live = isLivePermission(key);
                    return (
                        <PermissionRow
                            key={key}
                            label={label(key)}
                            comingSoon={!live}
                            on={live && has(key)}
                            locked={isSuper || !live}
                            onToggle={() => toggleOne(key)}
                        />
                    );
                })}
            </div>
        </div>
    );
}
