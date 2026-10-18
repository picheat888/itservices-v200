import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { cascadeToggle, countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { REQUEST_COUNT, REQUEST_TREE } from '../lib/permission-specs';
import { ChildList, ChildRow, GeneralCell, GroupHead, PermissionCard, PermissionCell, SetHead, WIDE_CHILDREN } from './permission-layout';

const { master: MASTER, groups: GROUPS, notify: NOTIFY } = REQUEST_TREE;
// Every gated key under the master.
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children]), ...NOTIFY];

const label = (key: string, lang: Lang) => actionLabel('requests', key.replace('requests.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('requests', key.replace('requests.', ''), lang);

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
        setDraft((prev) => cascadeToggle(prev, key, REQUEST_COUNT));
    };

    const activeCount = countGranted(REQUEST_COUNT, has).on;
    const totalCount = GATED_KEYS.length;
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
                                            lockedBy={label(group.view, lang)}
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
                                    lockedBy={label(MASTER, lang)}
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
