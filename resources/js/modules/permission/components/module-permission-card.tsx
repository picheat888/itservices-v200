import type { Lang } from '@/shared/types';
import { cascadeToggle, countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel, isLivePermission, moduleLabel } from '../lib/permission-labels';
import { moduleCardSpec, type ModuleMaster } from '../lib/permission-specs';
import { PermissionCard, PermissionCell, PlainRow, spreadRows } from './permission-layout';

/** A flat permission card (Permissions, Settings): master band, then the switches spread over the cells. Super is read-only. */
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
    /** Already in the reader's language. */
    subtitle: string;
    master: ModuleMaster;
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);
    const liveHas = (key: string) => isLivePermission(key) && has(key);
    const count = countGranted(moduleCardSpec(keys, master), liveHas).on;
    const label = (key: string) => {
        const [mod, action] = key.split('.');
        return actionLabel(mod, action, lang);
    };
    const desc = (key: string) => {
        const [mod, action] = key.split('.');
        return actionDescription(mod, action, lang);
    };

    // ── Real-master mode: one key gates the rest (cascade), like Stock ──────────
    if (master.mode === 'key') {
        const masterKey = master.key;
        const children = keys.filter((k) => k !== masterKey);
        const masterOn = has(masterKey);

        const spec = moduleCardSpec(keys, master);
        const toggleMaster = () => {
            if (isSuper) {
                return;
            }
            setDraft((prev) => cascadeToggle(prev, masterKey, spec));
        };

        const toggleChild = (key: string) => {
            if (isSuper || !masterOn || !isLivePermission(key)) {
                return;
            }
            setDraft((prev) => cascadeToggle(prev, key, spec));
        };

        return (
            <PermissionCard
                module={module}
                on={count}
                total={keys.length}
                keys={keys}
                lang={lang}
                master={{
                    pkey: masterKey,
                    label: label(masterKey),
                    sub: subtitle,
                    on: masterOn,
                    locked: isSuper,
                    onToggle: toggleMaster,
                    rest: children.length,
                }}
            >
                {masterOn &&
                    spreadRows(children).map((cell) => (
                        <PermissionCell key={cell[0]}>
                            {cell.map((key) => {
                                const live = isLivePermission(key);
                                return (
                                    <PlainRow
                                        key={key}
                                        pkey={key}
                                        lang={lang}
                                        dimOff
                                        label={label(key)}
                                        info={desc(key)}
                                        comingSoon={!live}
                                        on={live && has(key)}
                                        locked={isSuper || !live}
                                        onToggle={() => toggleChild(key)}
                                    />
                                );
                            })}
                        </PermissionCell>
                    ))}
            </PermissionCard>
        );
    }

    // ── Select-all mode: synthetic bulk toggle, children stay independent ───────
    const liveKeys = keys.filter((k) => isLivePermission(k));
    const allOn = liveKeys.length > 0 && liveKeys.every((k) => has(k));

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
        <PermissionCard
            module={module}
            on={count}
            total={keys.length}
            keys={keys}
            lang={lang}
            master={{ label: moduleLabel(module, lang), sub: subtitle, on: allOn, locked: isSuper, onToggle: toggleAll, rest: 0 }}
        >
            {spreadRows(keys).map((cell) => (
                <PermissionCell key={cell[0]}>
                    {cell.map((key) => {
                        const live = isLivePermission(key);
                        return (
                            <PlainRow
                                key={key}
                                pkey={key}
                                lang={lang}
                                dimOff
                                label={label(key)}
                                info={desc(key)}
                                comingSoon={!live}
                                on={live && has(key)}
                                locked={isSuper || !live}
                                onToggle={() => toggleOne(key)}
                            />
                        );
                    })}
                </PermissionCell>
            ))}
        </PermissionCard>
    );
}
