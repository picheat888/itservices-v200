// Bell tray invite: asks this browser to turn on push, or (iPad Safari) to add the Home Screen icon first.
// Shows only where nobody has answered yet; "ไว้ทีหลัง" hides it for 14 days on this browser.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Button } from '@/shared/ui/button';
import { useToastStore } from '@/stores/toast';
import { Bell, Loader2, Share } from 'lucide-react';
import { useState } from 'react';
import { usePushState } from '../hooks/use-push';
import { enablePush, inviteSnoozedUntil, notificationPermission, pushAnswer, snoozeInvite } from '../lib/push-client';
import { showInvite } from '../lib/push-rules';

const ROW_BUTTON = 'h-7 shrink-0 text-xs [@media(pointer:coarse)]:h-11';

export function PushInviteRow() {
    const t = useT();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const { state, setState } = usePushState(userId);
    const [snoozedUntil, setSnoozedUntil] = useState(() => (userId === null ? null : inviteSnoozedUntil(userId)));
    const [now] = useState(() => Date.now());
    const [busy, setBusy] = useState(false);

    const permission = notificationPermission();
    if (userId === null || state === undefined || !showInvite(state, permission, snoozedUntil, now, pushAnswer(userId))) return null;

    const later = () => {
        snoozeInvite(userId, now);
        setSnoozedUntil(inviteSnoozedUntil(userId));
    };

    const enable = async () => {
        setBusy(true);
        try {
            setState(await enablePush(userId));
        } catch {
            useToastStore.getState().push(t('notification_device_enable_failed'), 'error');
        } finally {
            setBusy(false);
        }
    };

    const homeScreen = state === 'needs_home_screen';
    const Icon = homeScreen ? Share : Bell;

    return (
        <div className="border-border bg-muted/40 flex items-center gap-2.5 border-b py-2.5 pr-3 pl-4">
            <Icon className="text-brand-ink mt-0.5 h-4 w-4 shrink-0 self-start" aria-hidden />
            <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-5 font-semibold">
                    {t(homeScreen ? 'notification_invite_home_title' : 'notification_invite_title')}
                </p>
                <p className="text-muted-foreground text-xs leading-[18px]">
                    {t(homeScreen ? 'notification_invite_home_text' : 'notification_invite_text')}
                </p>
            </div>
            {!homeScreen && (
                <Button
                    type="button"
                    size="sm"
                    className={`${ROW_BUTTON} px-3.5 font-semibold`}
                    onClick={enable}
                    disabled={busy}
                    aria-label={t('notification_invite_enable_label')}
                >
                    {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                    {t('notification_invite_enable')}
                </Button>
            )}
            <Button type="button" size="sm" variant="ghost" className={`${ROW_BUTTON} text-muted-foreground px-2`} onClick={later} disabled={busy}>
                {t('notification_invite_later')}
            </Button>
        </div>
    );
}
