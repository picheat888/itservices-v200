import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// Mirrors App\Support\Permissions::requestHierarchy() — keep in sync.
const MASTER = 'requests.module';
// Three capabilities, none of them a view/management split, so no group wears the "View" chip.
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'requests.submit', children: [], chip: false },
    { view: 'requests.view_all', children: [], chip: false },
    { view: 'requests.complete', children: [], chip: false },
];
// Who HEARS about the completion queue, which is not the same question as who may work it —
// a manager can want to know a request landed without being the one who closes it. Grouped
// under a heading rather than under `complete` so neither key implies the other; the master
// is their only gate. (Same shape as the Ticket card's level cluster.)
const NOTIFY = ['requests.notify_approved', 'requests.notify_stalled'];
// Every gated key under the master.
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children]), ...NOTIFY];

const label = (key: string, lang: Lang) => actionLabel('requests', key.replace('requests.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('requests', key.replace('requests.', ''), lang);

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
 * Renders the Requests permission card as a master → group → child tree with cascade, the
 * same shape as every other module card: turning a parent off clears + locks its children,
 * turning a child on implies its ancestors. Super is read-only (everything shown on + locked).
 * An (i) hint is shown for keys that carry a description.
 *
 * Requests used to fall through to the page's plain fallback card — a flat list of five
 * switches — because the module had no master to hang a tree off. It has one now.
 */
export function RequestPermissionTree({
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
    const totalCount = GATED_KEYS.length;

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="requests" on={activeCount} total={totalCount} lang={lang} />

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

                {/* Notification cluster — a heading, not a switch: there is no "may be
                    notified" right to grant, only the two mails underneath it. */}
                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-medium">
                            {lang === 'th' ? 'แจ้งเตือน' : 'Notifications'}
                            <InfoHint
                                text={
                                    lang === 'th'
                                        ? 'ใครได้ยินเรื่องคิวดำเนินการ - แยกจากใครมีสิทธิ์ปิดงาน หัวหน้าที่อยากรู้ว่ามีงานเข้าเปิดได้โดยไม่ต้องเป็นคนทำเอง'
                                        : 'Who hears about the completion queue - separate from who may work it, so a manager can follow it without closing anything.'
                                }
                            />
                        </span>
                    </div>
                    <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                        {NOTIFY.map((key) => {
                            const keyInfo = info(key, lang);
                            return (
                                <div key={key} className="flex min-h-[30px] items-center gap-2">
                                    <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                                        {label(key, lang)}
                                        {keyInfo && <InfoHint text={keyInfo} />}
                                    </span>
                                    <span className="ml-auto">
                                        <Switch on={has(key) && masterOn} locked={isSuper || !masterOn} onClick={() => toggle(key)} />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
