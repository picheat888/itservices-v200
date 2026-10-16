import { translate } from '@/lang';
import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// Mirrors App\Support\Permissions::requestHierarchy() — keep in sync.
const MASTER = 'requests.module';
// Per-type filing keys, shown as a cluster under `submit`.
const SUBMIT_TYPES = [
    'requests.submit_computer',
    'requests.submit_hardware',
    'requests.submit_mobile',
    'requests.submit_email',
    'requests.submit_social',
    'requests.submit_fileshare',
    'requests.submit_software',
    'requests.submit_recovery',
    'requests.submit_mailgroup',
    'requests.submit_telephone',
    'requests.submit_network',
    'requests.submit_cctv',
    'requests.submit_other',
];
type Group = { view: string; children: string[]; cluster?: { title: string; hint: string }; fillOnGrant?: boolean };
const GROUPS: Group[] = [
    {
        view: 'requests.submit',
        children: SUBMIT_TYPES,
        cluster: { title: 'perm_ui_request_types', hint: 'perm_ui_request_types_hint' },
        fillOnGrant: true,
    },
    { view: 'requests.view_all', children: ['requests.cancel_any'] },
    { view: 'requests.complete', children: [] },
];
// Notification keys, gated by the master only.
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

/** Requests permission card: master → group → child tree with cascade; super is read-only. */
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
                const group = GROUPS.find((g) => g.view === key);
                if (group) {
                    next.add(MASTER);
                    if (group.fillOnGrant) {
                        group.children.forEach((c) => next.add(c));
                    }
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
                    <div className="text-muted-foreground text-[10.5px]">{translate(lang, 'perm_ui_master_note')}</div>
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
                                <span className="ml-auto">
                                    <Switch on={viewOn} locked={isSuper || !masterOn} onClick={() => toggle(group.view)} />
                                </span>
                            </div>
                            {group.children.length > 0 && (
                                <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                                    {group.cluster && (
                                        <div className="flex min-h-[30px] items-center gap-1 text-[12.5px] font-medium">
                                            {translate(lang, group.cluster.title)}
                                            <InfoHint text={translate(lang, group.cluster.hint)} />
                                        </div>
                                    )}
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

                {/* Notification cluster */}
                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-medium">
                            {translate(lang, 'perm_ui_notifications')}
                            <InfoHint text={translate(lang, 'perm_ui_request_notify_hint')} />
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
