import type { Lang } from '@/shared/types';
import { countGranted, type CountSpec } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, GeneralCell, GroupHead, PermissionCard, PermissionCell, WIDE_CHILDREN } from './permission-layout';

// Mirrors App\Support\Permissions::stockHierarchy() — keep in sync.
const MASTER = 'stock.module';
// `chip: false` hides the "View" tag on single-switch groups.
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'stock.view_dashboard', children: [] },
    { view: 'stock.view', children: ['stock.manage_items', 'stock.delete', 'stock.receive', 'stock.return', 'stock.transfer'] },
    { view: 'stock.view_request', children: ['stock.request', 'stock.approve', 'stock.fulfill'] },
    { view: 'stock.view_count', children: [], chip: false },
    { view: 'stock.view_events', children: [], chip: false },
];
const ALL_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];
export const STOCK_COUNT: CountSpec = { master: MASTER, groups: GROUPS };

const label = (key: string, lang: Lang) => actionLabel('stock', key.replace('stock.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('stock', key.replace('stock.', ''), lang);

/** Stock card: master → view → management, with cascade; super is read-only. */
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

    const activeCount = countGranted(STOCK_COUNT, has).on;
    const view = (key: string) => ({
        pkey: key,
        label: label(key, lang),
        info: info(key, lang),
        on: has(key) && masterOn,
        locked: isSuper || !masterOn,
        onToggle: () => toggle(key),
    });

    return (
        <PermissionCard
            module="stock"
            on={activeCount}
            total={ALL_KEYS.length}
            lang={lang}
            keys={ALL_KEYS}
            master={{
                pkey: MASTER,
                label: label(MASTER, lang),
                info: info(MASTER, lang),
                on: masterOn,
                locked: isSuper,
                onToggle: () => toggle(MASTER),
                rest: ALL_KEYS.length - 1,
            }}
        >
            {masterOn && (
                <>
                    <GeneralCell lang={lang} rows={GROUPS.filter((g) => g.children.length === 0).map((g) => ({ key: g.view, ...view(g.view) }))} />
                    {GROUPS.filter((g) => g.children.length > 0).map((group) => {
                        const viewOn = has(group.view) && masterOn;
                        return (
                            <PermissionCell key={group.view} wide={group.children.length > WIDE_CHILDREN}>
                                <GroupHead chip={group.chip !== false} lang={lang} {...view(group.view)} />
                                <ChildList wide={group.children.length > WIDE_CHILDREN}>
                                    {group.children.map((child) => (
                                        <ChildRow
                                            key={child}
                                            pkey={child}
                                            label={label(child, lang)}
                                            aria={`${label(group.view, lang)} ${label(child, lang)}`}
                                            info={info(child, lang)}
                                            on={has(child) && viewOn}
                                            locked={isSuper || !viewOn}
                                            onToggle={() => toggle(child)}
                                        />
                                    ))}
                                </ChildList>
                            </PermissionCell>
                        );
                    })}
                </>
            )}
        </PermissionCard>
    );
}
