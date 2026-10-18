import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, GeneralCell, GroupHead, PermissionCard, PermissionCell, SetHead, WIDE_CHILDREN } from './permission-layout';

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
                // Last type off switches filing off too
                const owner = GROUPS.find((g) => g.fillOnGrant && g.children.includes(key));
                if (owner && !owner.children.some((c) => next.has(c))) {
                    next.delete(owner.view);
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
            module="requests"
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
                        const wide = group.children.length > WIDE_CHILDREN;
                        return (
                            <PermissionCell key={group.view} wide={wide}>
                                <GroupHead lang={lang} {...view(group.view)} />
                                <ChildList
                                    wide={wide}
                                    cluster={
                                        group.cluster && { label: translate(lang, group.cluster.title), info: translate(lang, group.cluster.hint) }
                                    }
                                >
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
                    {/* Notification cluster */}
                    <PermissionCell>
                        <SetHead label={translate(lang, 'perm_ui_notifications')} info={translate(lang, 'perm_ui_request_notify_hint')} />
                        <ChildList>
                            {NOTIFY.map((key) => (
                                <ChildRow
                                    key={key}
                                    pkey={key}
                                    label={label(key, lang)}
                                    info={info(key, lang)}
                                    on={has(key) && masterOn}
                                    locked={isSuper || !masterOn}
                                    onToggle={() => toggle(key)}
                                />
                            ))}
                        </ChildList>
                    </PermissionCell>
                </>
            )}
        </PermissionCard>
    );
}
