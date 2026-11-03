// The TV's pairing screen: a big 6-digit code that changes every 5 minutes, and where to type it.
import { useT } from '@/lang';
import { Unlink } from 'lucide-react';
import type { MonitorPairingCode } from '../types';

export function PairingScreen({
    pairing,
    now,
    unpaired,
    failed,
}: {
    pairing: MonitorPairingCode | undefined;
    now: number;
    unpaired: boolean;
    failed: boolean;
}) {
    const t = useT();
    const leftMs = pairing ? Math.max(0, Date.parse(pairing.expires_at) - now) : 0;
    const leftSec = Math.ceil(leftMs / 1000);
    const countdown = `${Math.floor(leftSec / 60)}:${String(leftSec % 60).padStart(2, '0')}`;

    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-7">
            {unpaired && (
                <div className="flex items-center gap-3.5 rounded-2xl bg-red-950 px-7 py-4 text-[26px] text-red-300">
                    <Unlink className="size-[30px]" aria-hidden />
                    {t('mon_unpaired_banner')}
                </div>
            )}
            <div className="bg-card flex w-[1120px] flex-col items-center gap-4.5 rounded-[28px] border px-18 pt-15 pb-13 text-center">
                <h1 className="flex items-center gap-4 text-[30px] font-bold">
                    <span className="bg-brand text-brand-foreground grid size-[52px] place-items-center rounded-xl text-[22px]" aria-hidden>
                        IT
                    </span>
                    {t('mon_title')}
                </h1>
                <div className="text-muted-foreground mt-3 text-[32px]">{t('mon_pair_label')}</div>
                {pairing ? (
                    <>
                        <div className="flex gap-12 text-[168px] leading-none font-bold tracking-[14px]" aria-live="polite">
                            <span>{pairing.code.slice(0, 3)}</span>
                            <span>{pairing.code.slice(3)}</span>
                        </div>
                        <div className="bg-muted mt-4.5 h-2 w-[520px] overflow-hidden rounded-full" aria-hidden>
                            <div className="bg-muted-foreground h-full" style={{ width: `${(leftMs / 300_000) * 100}%` }} />
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
