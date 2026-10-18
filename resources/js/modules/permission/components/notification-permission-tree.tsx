import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { cascadeToggle, countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { NOTIFICATION_COUNT, NOTIFICATION_TREE } from '../lib/permission-specs';
import { ChildList, ChildRow, GeneralCell, PermissionCard, PermissionCell, SetHead } from './permission-layout';

const { master: MASTER, groups: GROUPS, logs: LOGS } = NOTIFICATION_TREE;
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => g.keys), LOGS];

const label = (key: string, lang: Lang) => actionLabel('notifications', key.replace('notifications.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('notifications', key.replace('notifications.', ''), lang);

/** The Email & Notification permission card: master → tab → right; tab headings carry no switch. */
export function NotificationPermissionTree({
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
        setDraft((prev) => cascadeToggle(prev, key, NOTIFICATION_COUNT));
    };

    const activeCount = countGranted(NOTIFICATION_COUNT, has).on;
    const row = (key: string) => ({
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
            module="notifications"
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
                    <GeneralCell lang={lang} rows={[{ key: LOGS, ...row(LOGS) }]} />
                    {GROUPS.map((group) => (
                        <PermissionCell key={group.id}>
                            <SetHead label={translate(lang, group.labelKey)} />
                            <ChildList>
                                {group.keys.map((key) => (
                                    <ChildRow key={key} aria={`${translate(lang, group.labelKey)} ${label(key, lang)}`} {...row(key)} />
                                ))}
                            </ChildList>
                        </PermissionCell>
                    ))}
                </>
            )}
        </PermissionCard>
    );
}
