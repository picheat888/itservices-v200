// Settings → Monitor screen: pair the IT-room TV by the code it shows, then see whether it is online, re-pair or unpair it.
import { useT } from '@/lang';
import { useMonitorDevice, usePairMonitor, useUnpairMonitor, type MonitorDeviceStatus } from '@/modules/monitor';
import { LoadFailed } from '@/shared/components/load-failed';
import { SaveButton } from '@/shared/components/save-button';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import axios from 'axios';
import { AlertCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { PAIR_CODE_LENGTH } from '../lib/pair-code';
import { PairCodeInput } from './pair-code-input';

const ONLINE_WITHIN_MS = 60_000;

export function MonitorSection() {
    const t = useT();
    const titleId = useId();
    const { data, isLoading, isError, refetch } = useMonitorDevice();
    // After pairing or unpairing the focused control is gone; move focus to the heading so keyboard and reader users keep their place
    const headingRef = useRef<HTMLHeadingElement>(null);
    const paired = data?.paired;
    const seenPaired = useRef<boolean | undefined>(undefined);
    useEffect(() => {
        if (paired === undefined) return;
        if (seenPaired.current !== undefined && seenPaired.current !== paired) headingRef.current?.focus();
        seenPaired.current = paired;
    }, [paired]);

    return (
        <section aria-labelledby={titleId} className="flex max-w-[42.5rem] flex-col gap-5">
            <div>
                <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
                    {t('set_monitor')}
                </h2>
                <p className="text-muted-foreground text-sm">{t('set_monitor_desc')}</p>
            </div>

            {isError && !data ? (
                <LoadFailed onRetry={() => void refetch()} />
            ) : isLoading || !data ? (
                <Skeleton className="h-40 w-full rounded-xl" />
            ) : data.paired ? (
                <PairedCard status={data} />
            ) : (
                <PairForm />
            )}
        </section>
    );
}

function PairForm() {
    const t = useT();
    const hintId = useId();
    const pair = usePairMonitor();
    const [code, setCode] = useState('');
    // short: fewer than 6 digits; unknown: the server knows no such code
    const [invalid, setInvalid] = useState<'short' | 'unknown' | null>(null);
    const ready = code.length === PAIR_CODE_LENGTH;

    const submit = () => {
        if (pair.isPending) return;
        if (!ready) {
            setInvalid('short');
            return;
        }
        pair.mutate(code, {
            onError: (error) => {
                if (axios.isAxiosError(error) && error.response?.status === 422) setInvalid('unknown');
            },
        });
    };

    const host = window.location.host;
    const steps = [
        { title: t('set_monitor_step1_title').replace('{url}', `${host}/monitor`), hint: t('set_monitor_step1_hint') },
        { title: t('set_monitor_step2_title'), hint: t('set_monitor_step2_hint') },
        { title: t('set_monitor_step3_title'), hint: t('set_monitor_step3_hint') },
    ];

    return (
        <>
            <div className="flex flex-col gap-3 rounded-xl border p-4.5">
                <div className="text-[15px] font-semibold">{t('set_monitor_code_title')}</div>
                <div className="flex flex-wrap items-center gap-3.5">
                    <PairCodeInput
                        value={code}
                        onChange={(next) => {
                            setCode(next);
                            setInvalid(null);
                        }}
                        onSubmit={submit}
                        invalid={invalid !== null}
                        label={t('set_monitor_code_label')}
                        describedBy={hintId}
                    />
                    <SaveButton onClick={submit} loading={pair.isPending} loadingLabel={t('set_monitor_pairing')}>
                        {t('set_monitor_pair')}
                    </SaveButton>
                </div>
                <p
                    id={hintId}
                    className={cn('flex items-center gap-2 text-sm', invalid ? 'text-destructive' : 'text-muted-foreground')}
                    role={invalid ? 'alert' : undefined}
                >
                    {invalid && <AlertCircle className="size-4 shrink-0" aria-hidden />}
                    {invalid === 'short' ? t('set_monitor_code_short') : invalid ? t('set_monitor_code_invalid') : t('set_monitor_code_hint')}
                </p>
            </div>

            <div className="flex flex-col gap-3">
                <h3 className="text-[15px] font-semibold">{t('set_monitor_steps')}</h3>
                <ol className="flex flex-col gap-3">
                    {steps.map((step, i) => (
                        <li key={i} className="grid grid-cols-[26px_minmax(0,1fr)] items-start gap-3">
                            <span className="bg-muted grid size-6.5 place-items-center rounded-full text-[12.5px] font-bold" aria-hidden>
                                {i + 1}
                            </span>
                            <div className="text-sm">
                                <div className="leading-6.5 font-medium">{step.title}</div>
                                <div className="text-muted-foreground leading-relaxed">{step.hint}</div>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </>
    );
}

function PairedCard({ status }: { status: MonitorDeviceStatus }) {
    const t = useT();
    const fmt = useDateFormat();
    const confirm = useConfirm();
    const unpair = useUnpairMonitor();

    const seenAgo = status.last_seen_at ? Date.now() - Date.parse(status.last_seen_at) : null;
    const online = seenAgo !== null && seenAgo <= ONLINE_WITHIN_MS;
    const ago =
        seenAgo === null
            ? null
            : seenAgo < ONLINE_WITHIN_MS
              ? t('set_monitor_seconds_ago').replace('{n}', String(Math.max(1, Math.round(seenAgo / 1000))))
              : t('set_monitor_minutes_ago').replace('{n}', String(Math.round(seenAgo / 60_000)));
    const screenText = ago === null ? t('set_monitor_never') : t(online ? 'set_monitor_online' : 'set_monitor_offline').replace('{t}', ago);

    const ask = (kind: 'repair' | 'unpair') =>
        confirm({
            variant: kind === 'unpair' ? 'danger' : 'warn',
            title: t(`set_monitor_${kind}_title`),
            description: t(`set_monitor_${kind}_desc`),
            confirmText: t(kind === 'unpair' ? 'set_monitor_unpair' : 'set_monitor_repair'),
            action: () => unpair.mutateAsync(),
        });

    return (
        <>
            <div className="overflow-hidden rounded-xl border">
                <div className="flex items-center justify-between gap-3 border-b px-4.5 py-3.5">
                    <div className="flex items-center gap-2.5 text-[15px] font-semibold">
                        <span className={cn('size-2.5 rounded-full', online ? 'bg-emerald-500' : 'bg-muted-foreground')} aria-hidden />
                        {t('set_monitor_paired')}
                    </div>
                </div>
                <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-4 gap-y-3 px-4.5 py-4 text-sm">
                    <dt className="text-muted-foreground">{t('set_monitor_status')}</dt>
                    <dd>{screenText}</dd>
                    <dt className="text-muted-foreground">{t('set_monitor_device')}</dt>
                    <dd>
                        {t('set_monitor_device_value')
                            .replace('{browser}', status.browser ?? '-')
                            .replace('{os}', status.os ?? '-')}
                    </dd>
                    <dt className="text-muted-foreground">{t('set_monitor_paired_at')}</dt>
                    <dd>
                        {t('set_monitor_paired_value')
                            .replace('{t}', status.paired_at ? fmt.dateTime(status.paired_at) : '-')
                            .replace('{name}', status.paired_by ?? '-')}
                    </dd>
                </dl>
                <div className="bg-muted/40 flex flex-wrap gap-2 border-t px-4.5 py-3">
                    <Button variant="outline" size="sm" onClick={() => void ask('repair')}>
                        {t('set_monitor_repair')}
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => void ask('unpair')}>
                        {t('set_monitor_unpair')}
                    </Button>
                </div>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">{t('set_monitor_note')}</p>
        </>
    );
}
