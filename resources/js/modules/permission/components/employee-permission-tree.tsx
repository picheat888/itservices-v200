import type { Lang } from '@/shared/types';
import { cascadeToggle, countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { EMPLOYEE_COUNT, EMPLOYEE_TREE } from '../lib/permission-specs';
import { ChildList, ChildRow, GeneralCell, GroupHead, PermissionCard, PermissionCell, WIDE_CHILDREN } from './permission-layout';

const { master: MASTER, groups: GROUPS } = EMPLOYEE_TREE;
// Every key in the card; all of them live under the master.
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];

const label = (key: string, lang: Lang) => actionLabel('employees', key.replace('employees.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('employees', key.replace('employees.', ''), lang);

/** Employee card: master → view → management, with cascade; super is read-only. */
export function EmployeePermissionTree({
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
        setDraft((prev) => cascadeToggle(prev, key, EMPLOYEE_COUNT));
    };

    const activeCount = countGranted(EMPLOYEE_COUNT, has).on;
    const view = (key: string) => ({
        pkey: key,
        label: label(key, lang),
        info: info(key, lang),
        on: has(key) && masterOn,
        locked: isSuper || !masterOn,
        lockedBy: label(MASTER, lang),
        onToggle: () => toggle(key),
    });

    return (
        <PermissionCard
            module="employees"
            on={activeCount}
            total={GATED_KEYS.length}
            lang={lang}
            keys={GATED_KEYS}
            master={{
                pkey: MASTER,
                label: label(MASTER, lang),
                info: info(MASTER, lang),
                on: masterOn,
                locked: isSuper,
                onToggle: () => toggle(MASTER),
                rest: GATED_KEYS.length - 1,
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
                                            info={info(child, lang)}
                                            aria={`${label(group.view, lang)} ${label(child, lang)}`}
                                            on={has(child) && viewOn}
                                            locked={isSuper || !viewOn}
                                            lockedBy={label(group.view, lang)}
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
