import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { countGranted, type CountSpec } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, GeneralCell, PermissionCard, PermissionCell, SetHead } from './permission-layout';

// Mirrors App\Support\Permissions::notificationHierarchy() — keep in sync.
const MASTER = 'notifications.module';

// The page's Email and Notification tabs; edit and toggle stay separate keys (the controllers enforce the split).
const GROUPS: { id: string; labelKey: string; keys: string[] }[] = [
    {
        id: 'email',
        labelKey: 'perm_ui_group_email',
        keys: ['notifications.email_edit', 'notifications.email_toggle', 'notifications.email_test'],
    },
    {
        id: 'inapp',
        labelKey: 'perm_ui_group_inapp',
        keys: ['notifications.inapp_edit', 'notifications.inapp_toggle', 'notifications.inapp_test'],
    },
];

// The Logs tab stands on its own.
const LOGS = 'notifications.logs';

const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => g.keys), LOGS];
export const NOTIFICATION_COUNT: CountSpec = { master: MASTER, gated: [...GROUPS.flatMap((g) => g.keys), LOGS] };

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
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                // Dropping the master drops everything under it — matching normalizeNotifications().
                if (key === MASTER) {
                    GATED_KEYS.forEach((k) => next.delete(k));
                }
            } else {
                next.add(key);
                next.add(MASTER);
            }

            return next;
        });
    };

    const activeCount = countGranted(NOTIFICATION_COUNT, has).on;
    const row = (key: string) => ({
        pkey: key,
        label: label(key, lang),
        info: info(key, lang),
        on: has(key) && masterOn,
        locked: isSuper || !masterOn,
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
