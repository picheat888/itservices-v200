// My Profile drawer, Sign-ins tab: the devices signed in to this account, each with its sign-out,
// then the account's last login events.
import { useT } from '@/lang';
import { deviceLine, loginEventWords, placeLine, type LoginEventRow, type UserDevice } from '@/modules/auth';
import { DateTimeCell } from '@/shared/components/date-time-cell';
import { EmptyPane } from '@/shared/components/empty-pane';
import { LoadFailed, LoadFailedPanel } from '@/shared/components/load-failed';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { serverMessage } from '@/shared/lib/api-errors';
import { EMPTY_DATE, relativeTime } from '@/shared/lib/datetime';
import { isServerFailure } from '@/shared/lib/http-errors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { useEndMyDevice, useMyDevices, useMyLoginEvents } from '../hooks/use-my-devices';
import { TableCard } from './profile-table';

const DEVICE_ICONS: Record<string, LucideIcon> = { iOS: Smartphone, Android: Smartphone, iPadOS: Tablet };

const HEAD_CELL = 'bg-muted border-border text-muted-foreground border-b px-3 py-2 text-left text-[11px] font-bold tracking-wide uppercase';
const CELL = 'px-3 py-2.5 align-top';
const FAILED_TEXT = 'text-red-700 dark:text-destructive';

// Loading placeholder shaped like a device card
function DeviceCardSkeleton() {
    return (
        <div className="bg-card border-border flex items-start gap-3 rounded-xl border p-4 shadow-xs">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
                <Skeleton className="h-3 w-48 max-w-full" />
            </div>
        </div>
    );
}

function DeviceCard({ device, onSignOut }: { device: UserDevice; onSignOut: (device: UserDevice) => void }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const line = deviceLine(device, t);
    const place = placeLine(device);
    const Icon = DEVICE_ICONS[device.os] ?? Monitor;
    const lastUsed = relativeTime(device.last_active_at ?? device.signed_in_at, t, '', fmtN);

    return (
        <li className="bg-card border-border flex items-start gap-3 rounded-xl border p-4 shadow-xs">
            <div
                className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    device.current ? 'bg-accent text-brand' : 'bg-muted text-muted-foreground',
                )}
            >
                <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                {/* Name and badges */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold break-words">{line}</span>
                    {device.current && <StatusBadge tone="green">{t('profile_device_current')}</StatusBadge>}
                    {device.remembered && device.remember_expires_at && (
                        <StatusBadge tone="gray" dot={false}>
                            {t('profile_device_remembered').replace('{date}', fmt.date(device.remember_expires_at))}
                        </StatusBadge>
                    )}
                </div>
                {place && <div className="text-muted-foreground mt-0.5 text-xs break-words">{place}</div>}
                {/* Signed in and last used */}
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                    <span>{t('profile_device_signed_in').replace('{time}', fmt.dateTime(device.signed_in_at))}</span>
                    <span>{t('device_last_used').replace('{time}', lastUsed)}</span>
                </div>
            </div>
            {!device.current && (
                <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    aria-label={`${t('device_sign_out')} ${line}`}
                    onClick={() => onSignOut(device)}
                >
                    {t('device_sign_out')}
                </Button>
            )}
        </li>
    );
}

function LoginHistoryRow({ row }: { row: LoginEventRow }) {
    const t = useT();
    const { event, reason, failed } = loginEventWords(row, t);
    const device = row.os !== null && row.browser !== null ? deviceLine({ os: row.os, browser: row.browser }, t) : EMPTY_DATE;

    return (
        <tr className="border-border/60 border-t first:border-t-0">
            <td className={CELL}>
                <DateTimeCell value={row.created_at} />
            </td>
            <td className={CELL}>
                <div className={cn('text-xs font-medium break-words', failed && FAILED_TEXT)}>{event}</div>
                {reason && <div className={cn('text-[11px] break-words', failed ? FAILED_TEXT : 'text-muted-foreground')}>{reason}</div>}
            </td>
            <td className={cn(CELL, 'text-xs break-words')}>{device}</td>
            <td className={CELL}>
                {row.location && <div className="text-xs break-words">{row.location}</div>}
                {row.ip && <div className="text-muted-foreground text-[11px] break-all">{row.ip}</div>}
                {!row.location && !row.ip && <div className="text-muted-foreground text-xs">{EMPTY_DATE}</div>}
            </td>
        </tr>
    );
}

function LoginHistory({ rows, loading, failed, onRetry }: { rows: LoginEventRow[]; loading: boolean; failed: boolean; onRetry: () => void }) {
    const t = useT();

    return (
        <TableCard>
            {loading ? (
                <div className="flex flex-col gap-3 p-4" role="status" aria-busy="true">
                    <span className="sr-only">{t('loading')}</span>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                    ))}
                </div>
            ) : failed ? (
                <div className="flex justify-center px-4 py-8">
                    <LoadFailed onRetry={onRetry} />
                </div>
            ) : rows.length === 0 ? (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">{t('profile_empty_logins')}</p>
            ) : (
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th scope="col" className={HEAD_CELL}>
                                {t('profile_logins_col_time')}
                            </th>
                            <th scope="col" className={HEAD_CELL}>
                                {t('profile_logins_col_event')}
                            </th>
                            <th scope="col" className={HEAD_CELL}>
                                {t('profile_logins_col_device')}
                            </th>
                            <th scope="col" className={HEAD_CELL}>
                                {t('profile_logins_col_place')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <LoginHistoryRow key={row.id} row={row} />
                        ))}
                    </tbody>
                </table>
            )}
        </TableCard>
    );
}

export function MyDevicesTab() {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const devicesQuery = useMyDevices();
    const eventsQuery = useMyLoginEvents();
    const end = useEndMyDevice();

    const devices = devicesQuery.data?.devices ?? [];
    const limit = devicesQuery.data?.limit ?? 0;
    // This device first; the server's order (latest used) holds among the rest
    const ordered = [...devices].sort((a, b) => Number(b.current) - Number(a.current));

    const onSignOut = (device: UserDevice) =>
        confirm({
            variant: 'warn',
            title: t('profile_device_end_title'),
            description: t('profile_device_end_desc'),
            entity: { name: deviceLine(device, t), sub: placeLine(device) || undefined },
            confirmText: t('device_sign_out'),
            action: async () => {
                await end.mutateAsync(device.id);
                useToastStore.getState().push(t('profile_device_ended').replace('{device}', deviceLine(device, t)), 'success');
            },
            errorMessage: (error) => (isServerFailure(error) ? serverMessage(error) : undefined),
        });

    return (
        <div className="flex flex-col gap-3.5">
            {/* Devices heading and limit note */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-bold">{t('profile_devices_heading')}</h3>
                {limit > 0 && <span className="text-muted-foreground text-xs">{t('profile_devices_limit_note').replace('{n}', fmtN(limit))}</span>}
            </div>

            {/* Device cards */}
            {devicesQuery.isLoading ? (
                <div role="status" aria-busy="true" className="flex flex-col gap-2.5">
                    <span className="sr-only">{t('loading')}</span>
                    <DeviceCardSkeleton />
                    <DeviceCardSkeleton />
                </div>
            ) : devicesQuery.isError ? (
                <LoadFailedPanel onRetry={() => void devicesQuery.refetch()} />
            ) : ordered.length === 0 ? (
                <EmptyPane kind="empty" title={t('profile_empty_devices')} />
            ) : (
                <ul className="flex flex-col gap-2.5">
                    {ordered.map((device) => (
                        <DeviceCard key={device.id} device={device} onSignOut={onSignOut} />
                    ))}
                </ul>
            )}

            {/* Recent sign-ins */}
            <h3 className="mt-2 text-sm font-bold">{t('profile_logins_heading')}</h3>
            <LoginHistory
                rows={eventsQuery.data ?? []}
                loading={eventsQuery.isLoading}
                failed={eventsQuery.isError}
                onRetry={() => void eventsQuery.refetch()}
            />
            <p className="text-muted-foreground text-xs">{t('profile_logins_hint')}</p>
        </div>
    );
}
