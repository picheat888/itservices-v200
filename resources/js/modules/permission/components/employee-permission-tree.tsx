import { translate } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';
import { PermissionSwitch } from './permission-switch';

// Mirrors App\Support\Permissions::employeeHierarchy() — keep in sync.
const MASTER = 'employees.module';
// `chip: false` hides the "View" tag — used for single-switch groups (Dashboard,
// Org chart) that gate their whole tab rather than a view/management split.
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

const label = (key: string, lang: Lang) => actionLabel('employees', key.replace('employees.', ''), lang);

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

/**
 * Renders the Employee permission card as a master → view → management tree with
 * cascade: turning a parent off clears + locks its children; turning a child on
 * implies its ancestors. Super is read-only (everything shown on + locked).
 */
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

    const activeCount = masterOn ? GATED_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="employees" on={activeCount} total={GATED_KEYS.length} lang={lang} />

            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{label(MASTER, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">{translate(lang, 'perm_ui_master_note')}</div>
                </div>
                <div className="ml-auto">
                    <PermissionSwitch on={masterOn} locked={isSuper} onClick={() => toggle(MASTER)} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                {GROUPS.map((group) => {
                    const viewOn = has(group.view) && masterOn;
                    return (
                        <div key={group.view} className="py-0.5">
                            <div className="flex min-h-[34px] items-center gap-2">
                                <span className="text-sm font-medium">{label(group.view, lang)}</span>
                                <span className="ml-auto flex items-center gap-2">
                                    {group.chip !== false && (
                                        <span className="bg-brand/10 text-brand rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
                                            {translate(lang, 'perm_ui_view')}
                                        </span>
                                    )}
                                    <PermissionSwitch on={viewOn} locked={isSuper || !masterOn} onClick={() => toggle(group.view)} />
                                </span>
                            </div>
                            {group.children.length > 0 && (
                                <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                                    {group.children.map((child) => (
                                        <div key={child} className="flex min-h-[30px] items-center gap-2">
                                            <span className="text-muted-foreground text-[12.5px]">{label(child, lang)}</span>
                                            <span className="ml-auto">
                                                <PermissionSwitch
                                                    on={has(child) && viewOn}
                                                    locked={isSuper || !viewOn}
                                                    onClick={() => toggle(child)}
                                                />
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
