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

const ROW_BUTTON = 'h-9 px-3.5 text-[13px] [@media(pointer:coarse)]:h-11';

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
        <div className="border-border bg-muted/40 flex gap-3 border-b px-4 py-3.5">
            <span className="border-border bg-background text-brand-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
                <p className="text-[13px] font-semibold">{t(homeScreen ? 'notification_invite_home_title' : 'notification_invite_title')}</p>
                <p className="text-muted-foreground mt-0.5 mb-2.5 text-xs leading-relaxed">
                    {homeScreen
                        ? t('notification_invite_home_text')
                        : permission === 'granted'
                          ? t('notification_invite_text')
                          : `${t('notification_invite_text')} ${t('notification_invite_text_ask')}`}
                </p>
                <div className="flex flex-wrap gap-2">
                    {!homeScreen && (
                        <Button type="button" size="sm" className={ROW_BUTTON} onClick={enable} disabled={busy}>
                            {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                            {t('notification_invite_enable')}
                        </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" className={ROW_BUTTON} onClick={later} disabled={busy}>
                        {t('notification_invite_later')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
