/**
 * The contract reports' 12-month chart (from this month): one column per month stacked by contract
 * type, a tooltip listing every type on hover/focus, and the month's contracts on click.
 */
import { useT } from '@/lang';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { CardTitle, CardEmpty as Empty, monthLabel, shortYear, Swatch } from './chart-parts';
import { FILL } from './chart-tones';
import { CONTRACT_TYPE_TONE, CONTRACT_TYPES, type ContractTypeKey } from './contract-tones';
import { niceMax } from './weekly-ticket-chart';

/** One contract (or bill) that falls in a month. */
export interface ContractMonthItem {
    id: number;
    code: string;
    name: string;
    type: ContractTypeKey;
    /** Money (bill value) or 1 (a contract counted once). */
    amount: number;
    /** The day it falls on: the bill date or the end date (YYYY-MM-DD). */
    date: string;
    /** Yearly cost, for a month's foot line. */
    yearly: number;
}

export interface ContractMonth {
    /** YYYY-MM */
    month: string;
    items: ContractMonthItem[];
}

export interface ContractMonthCardProps {
    title: string;
    info: string | string[];
    months: ContractMonth[];
    /** money: amounts summed and shown as money (K/M on the axis); count: one per contract. */
    mode: 'money' | 'count';
    /** The right-hand cell of a contract row in the month popover, e.g. its bill or its end date. */
    rowValue: (item: ContractMonthItem) => React.ReactNode;
    /** Total line at the foot of the popover and the tooltip. */
    monthFoot: (month: ContractMonth) => React.ReactNode;
    /** Optional one line under the chart. */
    footer?: React.ReactNode;
    /** What the card says when no month has anything. */
    empty: { title: string; hint: string };
    /** Extra classes for the card (its grid span). */
    className?: string;
}

type Lang = 'th' | 'en';

/** Money with 2 decimals, as tiles and tables show it. */
export const contractMoney = (n: number, lang: Lang) => formatNumber(n, lang, { decimals: 2 });

/** Money for chart axes and short labels: 950, 12K, 1.25M, 12.5M. */
export function compactMoney(n: number): string {
    const abs = Math.abs(n);
    // 999,500 and up round to 1000K: show them as 1M
    if (abs >= 1e6 || Math.round(abs / 1e3) >= 1e3) return `${(n / 1e6).toFixed(abs >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
    if (abs >= 1e3) return `${Math.round(n / 1e3)}K`;
    return String(Math.round(n));
}

const count = (n: number, lang: Lang) => formatNumber(n, lang);

/** Axis top for money: the next 1 / 1.2 / 1.6 / 2 / 2.4 / 3 / 4 / 5 / 6 / 8 / 10 step at or above the peak. */
function niceMoney(value: number): number {
    if (value <= 0) return 4;
    const power = 10 ** Math.floor(Math.log10(value));
    return [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].map((x) => x * power).find((x) => x >= value) ?? value;
}

/** One month with its items summed per type. */
interface MonthFigures {
    month: ContractMonth;
    by: Record<ContractTypeKey, number>;
    contracts: Record<ContractTypeKey, number>;
    total: number;
}

function figures(month: ContractMonth): MonthFigures {
    const by = Object.fromEntries(CONTRACT_TYPES.map((k) => [k, 0])) as Record<ContractTypeKey, number>;
    const contracts = { ...by };
    for (const item of month.items) {
        by[item.type] += item.amount;
        contracts[item.type] += 1;
    }
    return { month, by, contracts, total: month.items.reduce((sum, item) => sum + item.amount, 0) };
}

/** The month's types, biggest first. */
const splitOf = (m: MonthFigures, used: ContractTypeKey[]) => used.filter((k) => m.by[k] > 0).sort((a, b) => m.by[b] - m.by[a]);

/** One row per contract type in a month: dot, name, amount (or count) and how many contracts. */
function TypeSplit({ m, used, mode }: { m: MonthFigures; used: ContractTypeKey[]; mode: 'money' | 'count' }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <>
            {splitOf(m, used).map((k) => (
                <div key={k} className="flex items-center justify-between gap-4">
                    <Swatch fill={FILL[CONTRACT_TYPE_TONE[k]]}>{t(`contract_type_${k}`)}</Swatch>
                    <span className="whitespace-nowrap">
                        <b className="font-bold tabular-nums">
                            {mode === 'money' ? contractMoney(m.by[k], lang) : t('rep_cmc_contracts').replace('{n}', count(m.contracts[k], lang))}
                        </b>
                        {mode === 'money' && (
                            <small className="text-muted-foreground ml-1.5 text-[11px]">
                                {t('rep_cmc_contracts').replace('{n}', count(m.contracts[k], lang))}
                            </small>
                        )}
                    </span>
                </div>
            ))}
        </>
    );
}

/** The month popover: its type split, then its contracts biggest first, 8 shown. */
function MonthList({
    m,
    used,
    mode,
    rowValue,
    monthFoot,
}: {
    m: MonthFigures;
    used: ContractTypeKey[];
    mode: 'money' | 'count';
    rowValue: ContractMonthCardProps['rowValue'];
    monthFoot: ContractMonthCardProps['monthFoot'];
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const rows = [...m.month.items].sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
    const shown = rows.slice(0, 8);

    return (
        <div className="space-y-1">
            <div className="font-semibold">{monthLabel(m.month.month, lang, false, true)}</div>
            <div className="border-border space-y-1 border-b pb-1.5">
                <TypeSplit m={m} used={used} mode={mode} />
            </div>
            {shown.map((item) => (
                <div key={`${item.id}-${item.date}`} className="flex items-start justify-between gap-4">
                    <span className="min-w-0">
                        <span className="block text-[11.5px] font-semibold" translate="no">
                            {item.code}
                        </span>
                        <small className="text-muted-foreground block max-w-52 truncate text-xs" title={item.name}>
                            {item.name}
                        </small>
                    </span>
                    <b className="font-bold whitespace-nowrap tabular-nums">{rowValue(item)}</b>
                </div>
            ))}
            {rows.length > shown.length && (
                <div className="border-border text-muted-foreground border-t pt-1">
                    {t('rep_cmc_more').replace('{n}', count(rows.length - shown.length, lang))}
                </div>
            )}
            <div className="border-border text-muted-foreground border-t pt-1">{monthFoot(m.month)}</div>
        </div>
    );
}

export function ContractMonthCard({ title, info, months, mode, rowValue, monthFoot, footer, empty, className }: ContractMonthCardProps) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [open, setOpen] = useState<string | null>(null);
    const [tip, setTip] = useState<number | null>(null);

    const data = months.map(figures);
    const used = CONTRACT_TYPES.filter((k) => data.some((m) => m.by[k] > 0));
    const peak = Math.max(0, ...data.map((m) => m.total));
    const top = mode === 'money' ? niceMoney(peak) : niceMax(peak);
    const axis = (v: number) => (mode === 'money' ? compactMoney(v) : count(v, lang));
    const at = (v: number) => ({ bottom: `${(v / top) * 100}%` });
    const thisMonth = months[0]?.month;
    const longMonth = (m: MonthFigures) => monthLabel(m.month.month, lang, false, true);
    const contractsText = (n: number) => t('rep_cmc_contracts').replace('{n}', count(n, lang));
    const amountText = (m: MonthFigures, k?: ContractTypeKey) =>
        mode === 'money'
            ? `${contractMoney(k ? m.by[k] : m.total, lang)} (${contractsText(k ? m.contracts[k] : m.month.items.length)})`
            : contractsText(k ? m.contracts[k] : m.month.items.length);
    const columnLabel = (m: MonthFigures) =>
        [
            mode === 'money'
                ? t('rep_cmc_month_money')
                      .replace('{month}', longMonth(m))
                      .replace('{amount}', contractMoney(m.total, lang))
                      .replace('{n}', count(m.month.items.length, lang))
                : t('rep_cmc_month_count').replace('{month}', longMonth(m)).replace('{n}', count(m.month.items.length, lang)),
            ...splitOf(m, used).map((k) => `${t(`contract_type_${k}`)} ${amountText(m, k)}`),
            ...(m.month.month === thisMonth ? [t('rep_cmc_now')] : []),
        ].join(', ');

    const tipMonth = tip !== null && open === null ? data[tip] : null;
    const tipPlace = tip === null ? undefined : tip < 6 ? { left: `${(tip / 12) * 100}%` } : { right: `${((11 - tip) / 12) * 100}%` };

    return (
        <Card className={cn('flex flex-col overflow-hidden', className)}>
            <CardTitle
                title={title}
                info={info}
                sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {used.map((k) => (
                            <Swatch key={k} fill={FILL[CONTRACT_TYPE_TONE[k]]}>
                                {t(`contract_type_${k}`)}
                            </Swatch>
                        ))}
                        <span className="inline-flex items-center gap-1.5">
                            <i aria-hidden className="border-brand inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed" />
                            {t('rep_cmc_now')}
                        </span>
                    </span>
                }
            />
            {peak === 0 ? (
                <Empty kind="empty" title={empty.title} hint={empty.hint} />
            ) : (
                <div className="flex flex-1 flex-col px-5 pt-4 pb-3">
                    <p className="sr-only">
                        {t('rep_cmc_aria')
                            .replace('{title}', title)
                            .replace('{from}', longMonth(data[0]))
                            .replace('{to}', longMonth(data[data.length - 1]))}{' '}
                        {data
                            .filter((m) => m.total > 0)
                            .map((m) => `${longMonth(m)} ${mode === 'money' ? contractMoney(m.total, lang) : contractsText(m.total)}`)
                            .join(', ')}
                    </p>
                    <div className="flex min-h-56 flex-1 gap-2">
                        <div aria-hidden className={cn('shrink-0 pt-[22px] pb-9', mode === 'money' ? 'w-10' : 'w-6')}>
                            <div className="relative h-full">
                                {[0, top / 2, top].map((v) => (
                                    <span
                                        key={v}
                                        className="text-muted-foreground absolute right-0 translate-y-1/2 text-[10.5px] leading-none tabular-nums"
                                        style={at(v)}
                                    >
                                        {axis(v)}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div
                                className="border-border relative mt-[22px] flex-1 border-b"
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && open === null) setTip(null);
                                }}
                            >
                                <div aria-hidden>
                                    {[top / 2, top].map((v) => (
                                        <div key={v} className="border-border absolute inset-x-0 border-t" style={at(v)} />
                                    ))}
                                    {[top / 4, (top * 3) / 4].map((v) => (
                                        <div key={v} className="border-border absolute inset-x-0 border-t border-dashed" style={at(v)} />
                                    ))}
                                </div>
                                <div className="absolute inset-0 flex items-end gap-1 sm:gap-2.5">
                                    {data.map((m, i) => {
                                        const pieces = used.filter((k) => m.by[k] > 0);
                                        const current = m.month.month === thisMonth;
                                        return (
                                            <Popover
                                                key={m.month.month}
                                                open={open === m.month.month}
                                                onOpenChange={(next) => {
                                                    setOpen(next ? m.month.month : null);
                                                    setTip(null);
                                                }}
                                            >
                                                <PopoverTrigger
                                                    type="button"
                                                    disabled={m.month.items.length === 0}
                                                    aria-label={columnLabel(m)}
                                                    onPointerEnter={(event) => event.pointerType === 'mouse' && setTip(i)}
                                                    onPointerLeave={() => setTip(null)}
                                                    onFocus={(event) => event.currentTarget.matches(':focus-visible') && setTip(i)}
                                                    onBlur={() => setTip(null)}
                                                    className={cn(
                                                        'focus-visible:ring-brand flex h-full min-w-0 flex-1 cursor-pointer touch-manipulation flex-col items-center justify-end rounded-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default',
                                                        'hover:bg-brand/5 data-[state=open]:bg-brand/10 disabled:hover:bg-transparent',
                                                    )}
                                                >
                                                    <span
                                                        aria-hidden
                                                        className="relative block w-full max-w-8"
                                                        style={{ height: m.total > 0 ? `max(${(m.total / top) * 100}%, ${pieces.length * 4}px)` : 0 }}
                                                    >
                                                        {current && m.total > 0 && (
                                                            <span className="border-brand pointer-events-none absolute -inset-x-[3px] -top-[3px] bottom-0 rounded-t-md border-2 border-b-0 border-dashed" />
                                                        )}
                                                        {m.total > 0 && (
                                                            <span
                                                                className={cn(
                                                                    'absolute -top-[18px] left-1/2 -translate-x-1/2 text-center text-[10.5px] font-semibold whitespace-nowrap tabular-nums',
                                                                    current && 'text-brand-ink',
                                                                )}
                                                            >
                                                                {axis(m.total)}
                                                            </span>
                                                        )}
                                                        <span className="flex h-full flex-col-reverse gap-px overflow-hidden rounded-t-md">
                                                            {pieces.map((k) => (
                                                                <span
                                                                    key={k}
                                                                    className={cn('block min-h-[3px] w-full basis-0', FILL[CONTRACT_TYPE_TONE[k]])}
                                                                    style={{ flexGrow: m.by[k] }}
                                                                />
                                                            ))}
                                                        </span>
                                                    </span>
                                                </PopoverTrigger>
                                                <PopoverContent
                                                    side={i < 6 ? 'right' : 'left'}
                                                    align="start"
                                                    aria-label={longMonth(m)}
                                                    className="w-auto max-w-[22rem] min-w-[17rem] px-3 py-2 text-xs leading-normal"
                                                >
                                                    <MonthList m={m} used={used} mode={mode} rowValue={rowValue} monthFoot={monthFoot} />
                                                </PopoverContent>
                                            </Popover>
                                        );
                                    })}
                                </div>
                                {tipMonth && tipMonth.total > 0 && (
                                    <div
                                        aria-hidden
                                        className="border-border bg-background pointer-events-none absolute top-1 z-20 max-w-[18rem] min-w-[14rem] space-y-1 rounded-lg border px-3 py-2 text-xs leading-normal shadow-lg [@media(hover:none)]:hidden"
                                        style={tipPlace}
                                    >
                                        <div className="font-semibold">{longMonth(tipMonth)}</div>
                                        <TypeSplit m={tipMonth} used={used} mode={mode} />
                                        <div className="border-border text-muted-foreground border-t pt-1">{monthFoot(tipMonth.month)}</div>
                                        <div className="text-muted-foreground text-[11px]">{t('rep_cmc_open_list')}</div>
                                    </div>
                                )}
                            </div>
                            <div aria-hidden className="flex h-9 shrink-0 gap-1 pt-1.5 sm:gap-2.5">
                                {data.map((m) => (
                                    <div key={m.month.month} className="relative min-w-0 flex-1">
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-center text-[10.5px] whitespace-nowrap">
                                            <b
                                                className={cn(
                                                    'block font-semibold',
                                                    m.month.month === thisMonth ? 'text-brand-ink' : 'text-foreground',
                                                )}
                                            >
                                                {monthLabel(m.month.month, lang, false)}
                                            </b>
                                            <span className="text-muted-foreground tabular-nums">{shortYear(m.month.month, lang)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {footer && peak > 0 && <p className="border-border/60 text-muted-foreground line-clamp-2 border-t px-5 py-3 text-xs">{footer}</p>}
        </Card>
    );
}
