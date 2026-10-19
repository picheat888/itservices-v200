// Sign-in dialog for an account at its device limit: sign out at least one listed device, then finish signing in.
import { useT } from '@/lang';
import { authApi, type DeviceLimitResponse, type UserDevice } from '@/modules/auth/api/authApi';
import { canContinue, deviceLine, isPendingExpired, placeLine } from '@/modules/auth/lib/device-limit';
import { CenteredAlert } from '@/shared/components/centered-alert';
import { SaveButton } from '@/shared/components/save-button';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { relativeTime } from '@/shared/lib/datetime';
import { httpStatus, markShownInline } from '@/shared/lib/http-errors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Check, Loader2, MonitorSmartphone } from 'lucide-react';
import { useState } from 'react';

export function DeviceLimitDialog({
    open,
    limit,
    completing,
    errorText,
    failureText,
    onContinue,
    onCancel,
    onExpired,
}: {
    open: boolean;
    limit: DeviceLimitResponse | null;
    /** The sign-in that finishes the dialog is running. */
    completing: boolean;
    /** Why that sign-in failed, already worded. */
    errorText?: string;
    /** Words a failed sign-out for the dialog's error line. */
    failureText: (error: unknown) => string;
    onContinue: () => void;
    onCancel: () => void;
    /** The confirmation token ran out; the page shows the expired message. */
    onExpired: () => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const devices = limit?.devices ?? [];
    const [signedOut, setSignedOut] = useState<ReadonlySet<number>>(new Set());
    const [endingId, setEndingId] = useState<number | null>(null);
    const [endError, setEndError] = useState<string | null>(null);

    // A new answer from the server starts the list over
    const [seen, setSeen] = useState(limit);
    if (limit !== seen) {
        setSeen(limit);
        setSignedOut(new Set());
        setEndingId(null);
        setEndError(null);
    }

    const busy = endingId !== null || completing;

    const markSignedOut = (id: number) => setSignedOut((prev) => new Set(prev).add(id));

    const continueSignIn = () => {
        setEndError(null);
        onContinue();
    };

    const signOut = async (device: UserDevice) => {
        if (!limit || busy) return;
        setEndingId(device.id);
        setEndError(null);
        try {
            await authApi.signOutPendingDevice(device.id, limit.pending);
            markSignedOut(device.id);
        } catch (error) {
            if (isPendingExpired(error)) {
                onExpired();
            } else if (httpStatus(error) === 404) {
                // No longer signed in: the seat is free all the same
                markSignedOut(device.id);
            } else {
                markShownInline(error);
                setEndError(failureText(error));
            }
        } finally {
            setEndingId(null);
        }
    };

    const count = fmtN(devices.length);

    return (
        <CenteredAlert
            open={open}
            icon={MonitorSmartphone}
            title={t('login_device_limit_title').replace('{n}', count)}
            busy={busy}
            errorText={endError ?? errorText}
            className="max-w-[420px]"
            onClose={onCancel}
            actions={
                <>
                    <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onCancel}>
                        {t('cancel')}
                    </Button>
                    <SaveButton
                        type="button"
                        className="w-full font-semibold"
                        loading={completing}
                        loadingLabel={t('login_signing_in')}
                        disabled={!canContinue(signedOut) || busy}
                        onClick={continueSignIn}
                    >
                        {t('login_submit')}
                    </SaveButton>
                </>
            }
        >
            <span className="block">{t('login_device_limit_line1').replace('{n}', count)}</span>
            <span className="block">{t('login_device_limit_line2')}</span>
            {/* Device rows */}
            <span className="mt-4 grid gap-2 text-left">
                {devices.map((device) => (
                    <DeviceRow
                        key={device.id}
                        device={device}
                        done={signedOut.has(device.id)}
                        ending={endingId === device.id}
                        disabled={busy}
                        onSignOut={() => void signOut(device)}
                    />
                ))}
            </span>
        </CenteredAlert>
    );
}

function DeviceRow({
    device,
    done,
    ending,
    disabled,
    onSignOut,
}: {
    device: UserDevice;
    done: boolean;
    ending: boolean;
    disabled: boolean;
    onSignOut: () => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const line = deviceLine(device, t);
    const place = placeLine(device);
    const lastUsed = relativeTime(device.last_active_at ?? device.signed_in_at, t, '', fmtN);

    return (
        <span className="border-border bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <span className="min-w-0 flex-1">
                <span className="text-foreground block text-sm font-medium break-words">{line}</span>
                {place && <span className="text-muted-foreground block text-xs break-words">{place}</span>}
                <span className="text-muted-foreground block text-xs">{t('device_last_used').replace('{time}', lastUsed)}</span>
            </span>
            {done ? (
                <span
                    role="status"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
                >
                    <Check className="h-4 w-4" aria-hidden />
                    {t('device_signed_out_done')}
                </span>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn('shrink-0', ending && 'disabled:opacity-100')}
                    disabled={disabled}
                    aria-busy={ending || undefined}
                    aria-label={`${t('device_sign_out')} ${line}`}
                    onClick={onSignOut}
                >
                    {ending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {t('device_sign_out')}
                </Button>
            )}
        </span>
    );
}
