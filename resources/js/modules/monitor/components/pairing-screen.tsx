// The TV's pairing screen: a big 6-digit code that changes every 5 minutes, and where to type it.
import { Unlink } from 'lucide-react';
import { useMonitorT } from '../hooks/use-monitor-prefs';
import { useNow } from '../hooks/use-now';
import { codeLeftMs } from '../lib/monitor-mode';
import type { MonitorPairingCode } from '../types';
import { MonitorBrand } from './monitor-brand';
import { MonitorMenu } from './monitor-menu';

export function PairingScreen({
    pairing,
    receivedAt,
    unpaired,
    failed,
}: {
    pairing: MonitorPairingCode | undefined;
    receivedAt: number;
    unpaired: boolean;
    failed: boolean;
}) {
    const t = useMonitorT();
    // The countdown ticks here only, so the board never re-renders for it
    const now = useNow(1000);
    const leftMs = pairing ? codeLeftMs(receivedAt, pairing.expires_in, now) : 0;
    const leftSec = Math.ceil(leftMs / 1000);
    const countdown = `${Math.floor(leftSec / 60)}:${String(leftSec % 60).padStart(2, '0')}`;

    return (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-7">
            <MonitorMenu className="absolute top-0 right-0" />
            {unpaired && (
                <div className="flex items-center gap-3.5 rounded-2xl bg-red-50 px-7 py-4 text-[26px] text-red-800 dark:bg-red-950 dark:text-red-300">
                    <Unlink className="size-[30px]" aria-hidden />
                    {t('mon_unpaired_banner')}
                </div>
            )}
            <div className="bg-card flex w-[1120px] flex-col items-center gap-4.5 rounded-[28px] border px-18 pt-15 pb-13 text-center shadow-sm dark:shadow-none">
                <MonitorBrand />
                <div className="text-muted-foreground mt-3 text-[32px]">{t('mon_pair_label')}</div>
                {pairing ? (
                    <>
                        <div className="flex gap-12 text-[168px] leading-none font-bold tracking-[14px]" aria-live="polite">
                            <span>{pairing.code.slice(0, 3)}</span>
                            <span>{pairing.code.slice(3)}</span>
                        </div>
                        <div className="bg-muted mt-4.5 h-2 w-[520px] overflow-hidden rounded-full" aria-hidden>
                            <div className="bg-muted-foreground h-full" style={{ width: `${(leftMs / (pairing.expires_in * 1000)) * 100}%` }} />
                        </div>
                        <div className="text-muted-foreground text-[24px]">{t('mon_pair_changes_in').replace('{t}', countdown)}</div>
                    </>
                ) : (
                    <div className="text-muted-foreground h-[230px] content-center text-[28px]">{failed ? t('mon_pair_retry') : '…'}</div>
                )}
                <p className="mt-4.5 max-w-[900px] text-[30px] leading-[1.6] text-balance">{t('mon_pair_hint')}</p>
            </div>
        </div>
    );
}
