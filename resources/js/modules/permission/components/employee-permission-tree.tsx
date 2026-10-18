import type { Lang } from '@/shared/types';
import { countGranted, type CountSpec } from '../lib/permission-count';
import { actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, GeneralCell, GroupHead, PermissionCard, PermissionCell, WIDE_CHILDREN } from './permission-layout';

// Mirrors App\Support\Permissions::employeeHierarchy() — keep in sync.
const MASTER = 'employees.module';
// `chip: false` hides the "View" tag on single-switch groups.
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'employees.view_dashboard', children: [], chip: false },
    {
        view: 'employees.view',
        children: [
            'employees.add',
            'employees.import',
            'employees.edit',
            'employees.reset_password',
            'employees.resign',
            'employees.cancel_resign',
            'employees.set_credentials',
            'employees.delete',
        ],
    },
    { view: 'employees.view_section', children: ['employees.section_add', 'employees.section_edit', 'employees.section_delete'] },
    { view: 'employees.view_department', children: ['employees.department_add', 'employees.department_edit', 'employees.department_delete'] },
    {
        view: 'employees.view_position',
        children: ['employees.position_add', 'employees.position_edit', 'employees.position_delete', 'employees.position_special'],
    },
    { view: 'employees.view_org', children: [], chip: false },
];
// Every key in the card; all of them live under the master.
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children])];
export const EMPLOYEE_COUNT: CountSpec = { master: MASTER, groups: GROUPS };

const label = (key: string, lang: Lang) => actionLabel('employees', key.replace('employees.', ''), lang);

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
                    next.add(MASTER);
                }
                if (GROUPS.some((g) => g.view === key)) {
                    next.add(MASTER);
                }
            }
            return next;
        });
    };

    const activeCount = countGranted(EMPLOYEE_COUNT, has).on;
    const view = (key: string) => ({
        pkey: key,
        label: label(key, lang),
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
