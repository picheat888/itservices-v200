import type { Lang } from '@/shared/types';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, GeneralCell, GroupHead, PermissionCard, PermissionCell, WIDE_CHILDREN } from './permission-layout';

// Mirrors App\Support\Permissions::accessHierarchy() — keep in sync.
// Each registry's view key gates its tab; its Edit key also covers owners and members.
const MASTER = 'access.module';
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'access.overview', children: [], chip: false },
    { view: 'access.email_view', children: ['access.email_add', 'access.email_edit', 'access.email_delete'] },
    { view: 'access.file_view', children: ['access.file_add', 'access.file_edit', 'access.file_delete'] },
    { view: 'access.social_view', children: ['access.social_add', 'access.social_edit', 'access.social_delete'] },
    { view: 'access.software_view', children: ['access.software_add', 'access.software_edit', 'access.software_delete'] },
];
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];

const label = (key: string, lang: Lang) => actionLabel('access', key.replace('access.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('access', key.replace('access.', ''), lang);

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

/** Access Directory card: master → registry → action, with cascade; super is read-only. */
export function AccessPermissionTree({
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
                    GATED_KEYS.forEach((k) => next.delete(k));
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
                }
                next.add(MASTER);
            }
            return next;
        });
    };

    const activeCount = masterOn ? GATED_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;
    const totalCount = GATED_KEYS.length;
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
            module="access"
            on={activeCount}
            total={totalCount}
            lang={lang}
            keys={GATED_KEYS}
            master={{ pkey: MASTER, label: label(MASTER, lang), on: masterOn, locked: isSuper, onToggle: () => toggle(MASTER), rest: totalCount - 1 }}
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
