import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel, moduleLabel } from '../lib/permission-labels';

// Mirrors App\Support\Permissions::ticketHierarchy() — keep in sync.
const MASTER = 'tickets.module';
// Self-service pair: `create` opens cases; `edit_own` is its child. `my` (My Tickets
// tab) is a solo standalone switch. All three survive without the master.
const STANDALONE = { view: 'tickets.create', children: ['tickets.edit_own'] };
const STANDALONE_SOLO = 'tickets.my';
// Ticket Level keys — scope which categories a staff member sees / takes / gets alerts for.
const LEVELS = ['tickets.level_hardware', 'tickets.level_software', 'tickets.level_network', 'tickets.level_other'];
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'tickets.view_dashboard', children: [], chip: false },
    { view: 'tickets.view_all', children: ['tickets.resolve', 'tickets.forward', 'tickets.assign'] },
    { view: 'tickets.jobs', children: [], chip: false },
];
// Every key that lives under the master (excludes the standalone keys).
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children]), ...LEVELS];

const label = (key: string, lang: Lang) => actionLabel('tickets', key.replace('tickets.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('tickets', key.replace('tickets.', ''), lang);

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
 * Renders the Tickets permission card as a master → group → management tree with
 * cascade (mirrors AssetPermissionTree): turning a parent off clears + locks its
 * children; turning a child on implies its ancestors. The Ticket Level cluster
 * scopes categories under the master. The self-service keys (`create` + `edit_own`,
 * and the `my` tab) are standalone — the master never locks them. Super is
 * read-only (everything shown on + locked).
 */
export function TicketPermissionTree({
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
                // Turning off "Open Ticket" clears its edit child.
                if (key === STANDALONE.view) {
                    STANDALONE.children.forEach((c) => next.delete(c));
                }
            } else {
                next.add(key);
                const parent = GROUPS.find((g) => g.children.includes(key));
                if (parent) {
                    next.add(parent.view);
                    next.add(MASTER);
                }
                if (GROUPS.some((g) => g.view === key) || LEVELS.includes(key)) {
                    next.add(MASTER);
                }
                // A standalone child implies its self-service view (not the master).
                if (STANDALONE.children.includes(key)) {
                    next.add(STANDALONE.view);
                }
            }
            return next;
        });
    };

    const createOn = has(STANDALONE.view);
    const standaloneActive = (createOn ? 1 : 0) + STANDALONE.children.filter((c) => has(c) && createOn).length + (has(STANDALONE_SOLO) ? 1 : 0);
    const gatedActive = masterOn ? GATED_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;
    const activeCount = gatedActive + standaloneActive;
    const totalCount = GATED_KEYS.length + 1 + STANDALONE.children.length + 1; // + create + its children + my

    return (
        <div className="border-border rounded-lg border">
            <div className="border-border flex items-center justify-between border-b px-3.5 py-2.5">
                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{moduleLabel('tickets', lang)}</span>
                <span className={cn('font-mono text-[10.5px] font-bold', activeCount === 0 ? 'text-muted-foreground' : 'text-brand')}>
                    {activeCount}/{totalCount}
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

            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                {GROUPS.map((group) => {
                    const viewOn = has(group.view) && masterOn;
                    const viewInfo = info(group.view, lang);
                    return (
                        <div key={group.view} className="py-0.5">
                            <div className="flex min-h-[34px] items-center gap-2">
                                <span className="flex items-center gap-1 text-sm font-medium">
                                    {label(group.view, lang)}
                                    {viewInfo && <InfoHint text={viewInfo} />}
                                </span>
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
                                    {group.children.map((child) => {
                                        const childInfo = info(child, lang);
                                        return (
                                            <div key={child} className="flex min-h-[30px] items-center gap-2">
                                                <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                                                    {label(child, lang)}
                                                    {childInfo && <InfoHint text={childInfo} />}
                                                </span>
                                                <span className="ml-auto">
                                                    <Switch on={has(child) && viewOn} locked={isSuper || !viewOn} onClick={() => toggle(child)} />
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Ticket Level cluster — which categories this role may see / take / be alerted about. */}
                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-medium">
                            {lang === 'th' ? 'ระดับประเภทเคส (Tickets Level)' : 'Tickets Level'}
                            <InfoHint
                                text={
                                    lang === 'th'
                                        ? 'จำกัดประเภทเคสที่เจ้าหน้าที่เห็น รับ และถูกแจ้งเตือน - ไม่ติ๊กเลย = ไม่เห็นเคสใด'
                                        : 'Scopes which categories this role may see, take and be alerted about - none ticked = no cases at all.'
                                }
                            />
                        </span>
                    </div>
                    <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                        {LEVELS.map((level) => (
                            <div key={level} className="flex min-h-[30px] items-center gap-2">
                                <span className="text-muted-foreground text-[12.5px]">{label(level, lang)}</span>
                                <span className="ml-auto">
                                    <Switch on={has(level) && masterOn} locked={isSuper || !masterOn} onClick={() => toggle(level)} />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Standalone self-service keys — never locked by the master. */}
            <div className="border-border border-t px-3.5 py-1.5">
                <div className="flex min-h-[34px] items-center gap-2">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{label(STANDALONE.view, lang)}</div>
                        <div className="text-muted-foreground text-[10.5px]">
                            {lang === 'th' ? 'บริการตนเอง · ไม่ขึ้นกับตัวหลัก' : 'Self-service · independent of the master'}
                        </div>
                    </div>
                    <span className="ml-auto">
                        <Switch on={createOn} locked={isSuper} onClick={() => toggle(STANDALONE.view)} />
                    </span>
                </div>
                <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                    {STANDALONE.children.map((child) => {
                        const childInfo = info(child, lang);
                        return (
                            <div key={child} className="flex min-h-[30px] items-center gap-2">
                                <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                                    {label(child, lang)}
                                    {childInfo && <InfoHint text={childInfo} />}
                                </span>
                                <span className="ml-auto">
                                    <Switch on={has(child) && createOn} locked={isSuper || !createOn} onClick={() => toggle(child)} />
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div className="flex min-h-[34px] items-center gap-2">
                    <span className="flex items-center gap-1 text-sm font-medium">
                        {label(STANDALONE_SOLO, lang)}
                        {info(STANDALONE_SOLO, lang) && <InfoHint text={info(STANDALONE_SOLO, lang)} />}
                    </span>
                    <span className="ml-auto">
                        <Switch on={has(STANDALONE_SOLO)} locked={isSuper} onClick={() => toggle(STANDALONE_SOLO)} />
                    </span>
                </div>
            </div>
        </div>
    );
}
