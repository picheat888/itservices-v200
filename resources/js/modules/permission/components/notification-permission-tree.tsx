import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// Mirrors App\Support\Permissions::notificationHierarchy() — keep in sync.
const MASTER = 'notifications.module';

/**
 * The page's three tabs, each with the rights that belong to it.
 *
 * The two editing tabs carry the same three rights because they are the same job done to two
 * channels — and they are separate keys, not one shared set, so a role can be trusted with
 * the in-app wording without also being handed the email that leaves the building.
 *
 * Edit and toggle are split for a reason worth stating: switching an alert off stops it
 * reaching anybody, which is a decision about who hears what, while rewording it is a
 * decision about how it reads. The controllers enforce the split by looking at which fields
 * a save actually changed, so neither right can be used to do the other's work.
 */
const GROUPS: { id: string; label: { en: string; th: string }; keys: string[] }[] = [
    {
        id: 'email',
        label: { en: 'Email', th: 'อีเมล' },
        keys: ['notifications.email_edit', 'notifications.email_toggle', 'notifications.email_test'],
    },
    {
        id: 'inapp',
        label: { en: 'Notification', th: 'การแจ้งเตือนในระบบ' },
        keys: ['notifications.inapp_edit', 'notifications.inapp_toggle', 'notifications.inapp_test'],
    },
];

// The log stands on its own: reading who was written to, and what they were sent, is not a
// smaller version of being allowed to change it.
const LOGS = 'notifications.logs';

const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => g.keys), LOGS];

const label = (key: string, lang: Lang) => actionLabel('notifications', key.replace('notifications.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('notifications', key.replace('notifications.', ''), lang);

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

/** One indented row under a tab heading. */
function ChildRow({ keyName, on, locked, lang, onToggle }: { keyName: string; on: boolean; locked: boolean; lang: Lang; onToggle: () => void }) {
    const hint = info(keyName, lang);

    return (
        <div className="flex min-h-[30px] items-center gap-2">
            <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                {label(keyName, lang)}
                {hint && <InfoHint text={hint} />}
            </span>
            <span className="ml-auto">
                <Switch on={on} locked={locked} onClick={onToggle} />
            </span>
        </div>
    );
}

/**
 * The Email & Notification permission card: master → tab → right.
 *
 * The module used to hang off one key, so anyone who could reword a template could also
 * switch it off, send real mail and read every message the system had ever sent. The card
 * showed that as five rows, four of which were locked placeholders for keys that had never
 * existed. It is now the same tree every other module gets, over rights that are real.
 *
 * Tab headings carry no switch of their own: there is no "may use the Email tab" right to
 * grant, only the three things you can do on it.
 */
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

    const activeCount = masterOn ? GATED_KEYS.filter((k) => has(k)).length : 0;

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="notifications" on={activeCount} total={GATED_KEYS.length} lang={lang} />

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
                {GROUPS.map((group) => (
                    <div key={group.id} className="py-0.5">
                        {/* A heading, not a switch — see the component docblock. */}
                        <div className="flex min-h-[34px] items-center gap-2">
                            <span className="text-sm font-medium">{lang === 'th' ? group.label.th : group.label.en}</span>
                        </div>
                        <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                            {group.keys.map((key) => (
                                <ChildRow
                                    key={key}
                                    keyName={key}
                                    on={has(key) && masterOn}
                                    locked={isSuper || !masterOn}
                                    lang={lang}
                                    onToggle={() => toggle(key)}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-medium">
                            {label(LOGS, lang)}
                            {info(LOGS, lang) && <InfoHint text={info(LOGS, lang)!} />}
                        </span>
                        <span className="ml-auto">
                            <Switch on={has(LOGS) && masterOn} locked={isSuper || !masterOn} onClick={() => toggle(LOGS)} />
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
