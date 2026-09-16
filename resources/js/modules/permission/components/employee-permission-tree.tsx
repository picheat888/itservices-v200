import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// Mirrors App\Support\Permissions::employeeHierarchy() — keep in sync.
const MASTER = 'employees.module';
const STANDALONE = 'employees.edit_own';
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
// Every key that lives under the master (excludes the standalone edit_own).
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

/**
 * Renders the Employee permission card as a master → view → management tree with
 * cascade: turning a parent off clears + locks its children; turning a child on
 * implies its ancestors. `edit_own` is a standalone self-service switch the master
 * never locks. Super is read-only (everything shown on + locked).
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

    const editOwnOn = has(STANDALONE);
    const gatedActive = masterOn ? GATED_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;
    const activeCount = gatedActive + (editOwnOn ? 1 : 0);
    const totalCount = GATED_KEYS.length + 1; // + edit_own

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="employees" on={activeCount} total={totalCount} lang={lang} />

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
                                            {lang === 'th' ? 'ดู' : 'View'}
                                        </span>
                                    )}
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

            {/* Standalone self-service switch — never locked by the master. */}
            <div className="border-border flex items-center gap-2.5 border-t px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-medium">{label(STANDALONE, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">
                        {lang === 'th' ? 'ทุกผู้ใช้แก้โปรไฟล์ตัวเองได้ · ไม่ขึ้นกับตัวหลัก' : 'Self-service · independent of the master'}
                    </div>
                </div>
                <div className="ml-auto">
                    <Switch on={editOwnOn} locked={isSuper} onClick={() => toggle(STANDALONE)} />
                </div>
            </div>
        </div>
    );
}
