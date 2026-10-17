// "รับเข้าและเบิกออกรายเดือน": receive + return above the line, issue below, in pieces (the MonthFlowCard look of transfer-cards.tsx).
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { useLayoutEffect, useRef, useState } from 'react';
import type { StockFlowMonth } from '../types';
import {
    barTop,
    CardEmpty,
    CardTitle,
    currentMonth,
    monthDensity,
    monthLabel,
    monthLabelPlace,
    reportDates,
    SCROLL_AFTER_MONTHS,
    SCROLL_MONTH_PX,
    shortYear,
    Swatch,
} from './chart-parts';
import { FILL } from './chart-tones';
import { MV_TONE, signedCount, stockCount, stockMoney } from './stock-parts';
import { axisTop } from './weekly-ticket-chart';

/** The three charted kinds, bottom piece first above the line. */
const IN_KINDS = ['receive', 'return'] as const;
const CHARTED = ['receive', 'return', 'issue'] as const;

/** ▲ in / ▼ out, so the halves never read by colour alone. */
function FlowMark({ dir }: { dir: 'in' | 'out' }) {
    return (
        <i
            aria-hidden
            className={cn(
                'inline-block h-2.5 w-2.5 shrink-0',
                dir === 'in'
                    ? cn(FILL[MV_TONE.receive], '[clip-path:polygon(50%_0,100%_100%,0_100%)]')
                    : cn(FILL[MV_TONE.issue], '[clip-path:polygon(0_0,100%_0,50%_100%)]'),
            )}
        />
    );
}

const inQty = (m: StockFlowMonth) => m.receive + m.return;

export function StockFlowCard({ months, to, className }: { months: StockFlowMonth[]; to: string | null; className?: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const up = axisTop(Math.max(0, ...months.map(inQty)));
    // The lower half never shrinks below a quarter of the upper, so a small issue month still reads.
    const down = axisTop(Math.max(Math.ceil(up / 4), ...months.map((m) => m.issue)));
    const upAt = (v: number) => ({ bottom: `${(v / up) * 100}%` });
    const downAt = (v: number) => ({ top: `${(v / down) * 100}%` });
    const barHeight = (v: number, top: number) => (v > 0 ? `max(${(v / top) * 100}%, 3px)` : '0px');
    const thisMonth = currentMonth();
    const hasCurrent = months.some((m) => m.month === thisMonth);
    // Counted up to the range end when it falls before today, as the write-off chart.
    const today = new Date();
    const toDate = to ? new Date(`${to}T00:00:00`) : today;
    const partialNote = t('rep_wo_month_partial_tip').replace('{date}', reportDates(lang).date(toDate < today ? toDate : today));
    const density = monthDensity(months);
    const scroll = months.length > SCROLL_AFTER_MONTHS;
    const scroller = useRef<HTMLDivElement>(null);
    const bars = useRef(new Map<string, HTMLElement>());
    const [scrollbar, setScrollbar] = useState(0);
    useLayoutEffect(() => {
        const element = scroller.current;
        if (!element) return;
        element.scrollLeft = element.scrollWidth;
        const observer = new ResizeObserver(() => setScrollbar(element.offsetHeight - element.clientHeight));
        observer.observe(element);
        return () => observer.disconnect();
    }, [months]);
    const total = (key: (typeof CHARTED)[number]) => months.reduce((s, m) => s + m[key], 0);
    const monthText = (m: StockFlowMonth) =>
        [
            monthLabel(m.month, lang, false, true),
            ...CHARTED.map((k) => `${t(`stock_mv_${k}`)} ${stockCount(m[k], lang)}`),
            m.month === thisMonth ? partialNote : null,
        ]
            .filter(Boolean)
            .join(', ');
    const label = (m: StockFlowMonth, value: number, place: string) =>
        density.top &&
        value > 0 && (
            <span
                className={cn(
                    'absolute left-1/2 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap tabular-nums',
                    place,
                    m.month === thisMonth && 'text-brand',
                )}
            >
                {stockCount(value, lang)}
            </span>
        );

    return (
        <Card className={cn('flex flex-col overflow-hidden', className)}>
            <CardTitle
                title={t('rep_smv_flow_title')}
                info={[t('rep_smv_flow_info_halves'), t('rep_smv_flow_info_rest')]}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {CHARTED.map((k) => (
                            <Swatch key={k} fill={FILL[MV_TONE[k]]}>
                                {t(`stock_mv_${k}`)}
                            </Swatch>
                        ))}
                        {hasCurrent && (
                            <span className="inline-flex items-center gap-1.5">
                                <i aria-hidden className="border-brand inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed" />
                                {t('rep_wo_month_partial')}
                            </span>
                        )}
                    </span>
                }
            />
            {total('receive') + total('return') + total('issue') === 0 ? (
                <CardEmpty>{t('rep_smv_flow_empty')}</CardEmpty>
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <p className="sr-only">
                        {t('rep_smv_flow_aria')
                            .replace('{from}', monthLabel(months[0].month, lang, false, true))
                            .replace('{to}', monthLabel(months[months.length - 1].month, lang, false, true))
                            .replace('{receive}', stockCount(total('receive'), lang))
                            .replace('{return}', stockCount(total('return'), lang))
                            .replace('{issue}', stockCount(total('issue'), lang))}
                    </p>
                    <div className="flex min-h-64 flex-1 gap-2">
                        {/* Y axis */}
                        <div aria-hidden className="flex w-11 shrink-0 flex-col">
                            <div className="relative mt-[18px]" style={{ flex: up }}>
                                {[up / 2, up].map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 translate-y-1/2 text-[10.5px] leading-none tabular-nums"
                                        style={upAt(v)}
                                    >
                                        {stockCount(v, lang)}
                                    </span>
                                ))}
                            </div>
                            <div className="h-0.5 shrink-0" />
                            <div className="relative mb-[18px]" style={{ flex: down }}>
                                <span className="text-muted-foreground absolute top-0 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-2 text-[10.5px] leading-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark dir="in" />
                                        {t('rep_smv_axis_in')}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <FlowMark dir="out" />
                                        {t('rep_smv_axis_out')}
                                    </span>
                                </span>
                                {[down / 2, down].map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 -translate-y-1/2 text-[10.5px] leading-none tabular-nums"
                                        style={downAt(v)}
                                    >
                                        {stockCount(v, lang)}
                                    </span>
                                ))}
                            </div>
                            <div className="shrink-0" style={{ height: `calc(2.25rem + ${scrollbar}px)` }} />
                        </div>
                        <div ref={scroller} className={cn('flex min-w-0 flex-1 flex-col', scroll && 'overflow-x-auto overflow-y-hidden')}>
                            <div className="flex min-w-full flex-1 flex-col" style={scroll ? { width: months.length * SCROLL_MONTH_PX } : undefined}>
                                <div className="relative flex flex-1 flex-col">
                                    {/* In: receive + return */}
                                    <div className="relative mt-[18px]" style={{ flex: up }}>
                                        <div aria-hidden>
                                            {[up / 2, up].map((v) => (
                                                <div key={v} className="border-border absolute inset-x-0 border-t" style={upAt(v)} />
                                            ))}
                                            {[up / 4, (up * 3) / 4].map((v) => (
                                                <div key={v} className="border-border absolute inset-x-0 border-t border-dashed" style={upAt(v)} />
                                            ))}
                                        </div>
                                        <div aria-hidden className={cn('absolute inset-0 flex items-end', density.gap)}>
                                            {months.map((m) => (
                                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                                                    <div
                                                        ref={(el) => {
                                                            if (el) bars.current.set(m.month, el);
                                                            else bars.current.delete(m.month);
                                                        }}
                                                        className={cn('relative w-full', density.bar)}
                                                        style={{ height: barHeight(inQty(m), up) }}
                                                    >
                                                        {m.month === thisMonth && inQty(m) > 0 && (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] -top-[3px] bottom-0 rounded-t-md border-2 border-b-0 border-dashed" />
                                                        )}
                                                        {label(m, inQty(m), '-top-[18px]')}
                                                        <div
                                                            className={cn(
                                                                'flex h-full flex-col-reverse gap-px overflow-hidden',
                                                                !density.thin && 'rounded-t-md',
                                                            )}
                                                        >
                                                            {IN_KINDS.map((k) =>
                                                                m[k] > 0 ? (
                                                                    <span
                                                                        key={k}
                                                                        className={cn(
                                                                            'block min-h-px w-full basis-0 ring-1 ring-black/15 ring-inset dark:ring-white/10',
                                                                            FILL[MV_TONE[k]],
                                                                        )}
                                                                        style={{ flexGrow: m[k] }}
                                                                    />
                                                                ) : null,
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div aria-hidden className="border-muted-foreground/60 border-t-2" />
                                    {/* Out: issue */}
                                    <div className="relative mb-[18px]" style={{ flex: down }}>
                                        <div aria-hidden>
                                            <div className="border-border absolute inset-x-0 border-t border-dashed" style={downAt(down / 2)} />
                                            <div className="border-border absolute inset-x-0 border-t" style={downAt(down)} />
                                        </div>
                                        <div aria-hidden className={cn('absolute inset-0 flex items-start', density.gap)}>
                                            {months.map((m) => (
                                                <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center">
                                                    <div className={cn('relative w-full', density.bar)} style={{ height: barHeight(m.issue, down) }}>
                                                        {m.month === thisMonth && m.issue > 0 && (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] top-0 -bottom-[3px] rounded-b-md border-2 border-t-0 border-dashed" />
                                                        )}
                                                        <span className={cn('block h-full', !density.thin && 'rounded-b-md', FILL[MV_TONE.issue])} />
                                                        {label(m, m.issue, '-bottom-[18px]')}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Click targets */}
                                    <div className={cn('absolute inset-0 flex', density.gap)}>
                                        {months.map((m) => (
                                            <InfoPopover
                                                key={m.month}
                                                label={monthText(m)}
                                                anchor={() => barTop(bars.current.get(m.month), density.top && inQty(m) > 0 ? 18 : 0)}
                                                className="h-full min-w-0 flex-1 cursor-pointer"
                                                content={<FlowDetail month={m} partialNote={m.month === thisMonth ? partialNote : null} />}
                                            >
                                                <span className="sr-only">{monthLabel(m.month, lang, false, true)}</span>
                                            </InfoPopover>
                                        ))}
                                    </div>
                                </div>
                                {/* X axis */}
                                <div aria-hidden className={cn('flex h-9 shrink-0 pt-1.5', density.gap)}>
                                    {months.map((m, i) => (
                                        <div key={m.month} className="relative min-w-0 flex-1">
                                            {density.label(i, m.month) && (
                                                <div
                                                    className={cn(
                                                        'absolute top-0 text-[10.5px] whitespace-nowrap',
                                                        monthLabelPlace(density, i, months.length),
                                                    )}
                                                >
                                                    <b
                                                        className={cn(
                                                            'block',
                                                            m.month === thisMonth ? 'text-brand font-semibold' : 'text-foreground font-semibold',
                                                        )}
                                                    >
                                                        {monthLabel(m.month, lang, false)}
                                                    </b>
                                                    <span className="text-muted-foreground tabular-nums">{shortYear(m.month, lang)}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}

/** A month's popover: pieces per kind, the received and issued value, and the net adjustment when there is one. */
function FlowDetail({ month, partialNote }: { month: StockFlowMonth; partialNote: string | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="min-w-56 space-y-1">
            <div className="font-semibold">{monthLabel(month.month, lang, false, true)}</div>
            {(['receive', 'return', 'issue', 'transfer'] as const).map((k) => (
                <div key={k} className="flex items-center justify-between gap-4">
                    <Swatch fill={FILL[MV_TONE[k]]}>{t(`stock_mv_${k}`)}</Swatch>
                    <b className={cn('tabular-nums', month[k] === 0 && 'text-muted-foreground font-normal')}>
                        {t('rep_smv_pcs').replace('{n}', stockCount(month[k], lang))}
                    </b>
                </div>
            ))}
            <div className="text-muted-foreground border-border space-y-0.5 border-t pt-1">
                <div>{t('rep_smv_pop_receive_value').replace('{amount}', stockMoney(month.receive_value, lang))}</div>
                <div>{t('rep_smv_pop_issue_value').replace('{amount}', stockMoney(month.issue_value, lang))}</div>
                {month.adjust_net !== 0 && <div>{t('rep_smv_pop_adjust').replace('{n}', signedCount(month.adjust_net, lang))}</div>}
                {partialNote && <div>{partialNote}</div>}
            </div>
        </div>
    );
}
