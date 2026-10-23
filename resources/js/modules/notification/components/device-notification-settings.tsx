// My Profile, Notifications tab: this device's bell sound switch, its push switch with status, and a test push for those allowed to send tests.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { Button } from '@/shared/ui/button';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { usePushState } from '../hooks/use-push';
import { deviceSoundOn, disablePush, enablePush, sendTestPush, setDeviceSound } from '../lib/push-client';
import type { PushState } from '../lib/push-rules';

// States where the switch cannot be used: the row text leads with the state in its colour
type ProblemState = Exclude<PushState, 'on' | 'off'>;

const PROBLEM_TONE: Record<ProblemState, string> = {
    blocked: 'text-red-700 dark:text-red-400',
    needs_home_screen: 'text-amber-700 dark:text-amber-400',
    unsupported: 'text-muted-foreground',
};

const PROBLEM_TEXT: Partial<Record<ProblemState, string>> = {
    blocked: 'notification_device_blocked_text',
    needs_home_screen: 'notification_device_home_text',
};

const isProblem = (state: PushState | null | undefined): state is ProblemState => state != null && state !== 'on' && state !== 'off';

function SettingRow({ title, text, children }: { title: string; text: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
                <p className="text-[13px] font-semibold">{title}</p>
                <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{text}</div>
            </div>
            <div className="mt-0.5 shrink-0">{children}</div>
        </div>
    );
}

// On and off need no words: the switch shows them
function PushText({ state }: { state: PushState | null | undefined }) {
    const t = useT();
    if (!isProblem(state)) return <p>{t('notification_device_push_text')}</p>;
    const explanation = PROBLEM_TEXT[state];

    return (
        <p className={PROBLEM_TONE[state]}>
            {t(`notification_device_state_${state}`)}
            {explanation && ` ${t(explanation)}`}
        </p>
    );
}

export function DeviceNotificationSettings({ userId }: { userId: number }) {
    const t = useT();
    const [soundOn, setSoundOn] = useState(() => deviceSoundOn(userId));
    const { state, setState } = usePushState(userId);
    const [switching, setSwitching] = useState(false);
    const { can } = useAuth();
    const [testing, setTesting] = useState(false);

    const toggleSound = (next: boolean) => {
        setDeviceSound(userId, next);
        setSoundOn(next);
    };

    const togglePush = async (next: boolean) => {
        setSwitching(true);
        try {
            if (next) {
                setState(await enablePush(userId));
            } else {
                await disablePush(userId, { keepWanted: false });
                setState('off');
            }
        } catch {
            useToastStore.getState().push(t('notification_device_enable_failed'), 'error');
        } finally {
            setSwitching(false);
        }
    };

    const sendTest = async () => {
        setTesting(true);
        try {
            await sendTestPush();
            useToastStore.getState().push(t('notification_device_test_sent'), 'success');
        } catch {
            useToastStore.getState().push(t('notification_device_test_failed'), 'error');
        } finally {
            setTesting(false);
        }
    };

    const usable = state === 'on' || state === 'off';

    return (
        <div className="bg-card border-border divide-border/60 divide-y rounded-xl border">
            <SettingRow title={t('notification_device_sound')} text={t('notification_device_sound_text')}>
                <Switch checked={soundOn} onChange={toggleSound} aria-label={t('notification_device_sound')} />
            </SettingRow>

            <SettingRow title={t('notification_device_push')} text={<PushText state={state} />}>
                <DisabledReason reason={isProblem(state) ? t(`notification_device_state_${state}`) : null} label={t('notification_device_push')}>
                    <Switch
                        checked={state === 'on'}
                        onChange={togglePush}
                        disabled={!usable || switching}
                        aria-label={t('notification_device_push')}
                    />
                </DisabledReason>
            </SettingRow>

            {state === 'on' && can('notifications.inapp_test') && (
                <SettingRow title={t('notification_device_test')} text={t('notification_device_test_text')}>
                    <Button type="button" size="sm" variant="outline" className="h-9 px-3.5 text-[13px]" onClick={sendTest} disabled={testing}>
                        {testing && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                        {t('notification_device_test_send')}
                    </Button>
                </SettingRow>
            )}
        </div>
    );
}
