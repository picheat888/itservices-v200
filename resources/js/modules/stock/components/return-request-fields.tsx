// Return form (board 5): the fulfilled request this item went out on, then how much goes back into each Lot it drew,
// or which of its Serials come back for a serial item.
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { digitsOnly } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { ReturnableRequest } from '@/shared/types';
import { Input } from '@/shared/ui/input';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { useReturnableRequests } from '../hooks/use-stock';
import { fillAllLeft, returnLines } from '../lib/movement-form';

export type ReturnFieldErrors = { stock_request_id?: string; lots?: string; serial_ids?: string };

const CELL = 'border-t px-2 py-2 align-top first:pl-3 last:pr-3';
const HEAD = 'bg-muted/40 px-2 py-1.5 text-[11px] font-medium first:pl-3 last:pr-3';

export function ReturnRequestFields({
    itemId,
    unit,
    isSerial,
    request,
    onRequestChange,
    qtys,
    onQtysChange,
    serialIds,
    onSerialIdsChange,
    errors,
}: {
    itemId: number;
    unit: string | null;
    isSerial: boolean;
    request: ReturnableRequest | null;
    onRequestChange: (request: ReturnableRequest | null) => void;
    qtys: Record<number, string>;
    onQtysChange: (qtys: Record<number, string>) => void;
    serialIds: Set<number>;
    onSerialIdsChange: (ids: Set<number>) => void;
    errors: ReturnFieldErrors;
}) {
    const t = useT();

    return (
        <div className="space-y-3">
            <RequestPicker itemId={itemId} request={request} onChange={onRequestChange} error={errors.stock_request_id} />

            {request && !isSerial && <LotReturnTable request={request} unit={unit} qtys={qtys} onChange={onQtysChange} error={errors.lots} />}
            {request && isSerial && (
                <SerialReturnList request={request} selected={serialIds} onChange={onSerialIdsChange} error={errors.serial_ids} />
            )}

            <p className="text-muted-foreground text-xs leading-relaxed">
                {t('stock_return_to_lot_warehouse')}
                {isSerial && (
                    <>
                        <br />
                        {t('stock_return_serial_note')}
                    </>
                )}
            </p>
        </div>
    );
}

// Request picker — searched on the server, newest fulfilled first
function RequestPicker({
    itemId,
    request,
    onChange,
    error,
}: {
    itemId: number;
    request: ReturnableRequest | null;
    onChange: (request: ReturnableRequest | null) => void;
    error?: string;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const [query, setQuery] = useState('');
    const search = useDebouncedSearch(query);
    const list = useReturnableRequests(itemId, search);

    const toOption = (r: ReturnableRequest): SearchOption => ({
        value: String(r.id),
        label: [r.reference ?? `#${r.id}`, r.requester_name].join(' '),
        hint: r.fulfilled_at ? fmt.date(r.fulfilled_at) : undefined,
        sub: t('stock_return_option_left').replace('{n}', fmtN(r.left)),
        search: `${r.reference ?? ''} ${r.requester_name}`,
    });
    const requests = list.data ?? [];
    // Nothing of this item can come back at all
    const noneReturnable = !request && search === '' && list.isSuccess && !list.isPlaceholderData && requests.length === 0;

    return (
        <>
            <Field label={t('stock_return_request_label')} required error={error} help={t('stock_return_request_hint')}>
                <SearchableSelect
                    value={request ? String(request.id) : ''}
                    onChange={(value) => onChange(requests.find((r) => String(r.id) === value) ?? null)}
                    options={requests.map(toOption)}
                    selectedOption={request ? toOption(request) : undefined}
                    placeholder={t('stock_return_request_pick')}
                    searchPlaceholder={t('stock_return_request_ph')}
                    onSearch={setQuery}
                    loading={list.isFetching}
                    emptyHint={t('stock_empty_return_requests_hint')}
                />
            </Field>
            {noneReturnable && (
                <EmptyState
                    kind="pick"
                    title={t('stock_empty_return_requests')}
                    hint={t('stock_empty_return_requests_hint')}
                    className="min-h-0 rounded-md border border-dashed py-4"
                />
            )}
        </>
    );
}

// Non-serial item — per-Lot quantities against what the request drew
function LotReturnTable({
    request,
    unit,
    qtys,
    onChange,
    error,
}: {
    request: ReturnableRequest;
    unit: string | null;
    qtys: Record<number, string>;
    onChange: (qtys: Record<number, string>) => void;
    error?: string;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const titleId = useId();
    const { lines, total } = returnLines(request.lots, qtys);

    return (
        <div className="space-y-2">
            <div className={cn('overflow-hidden rounded-lg border', error && 'border-destructive')}>
                <div className="flex items-center gap-2 px-3 py-2">
                    <span id={titleId} className="text-muted-foreground flex-1 text-xs font-semibold">
                        {t('stock_return_into_lots')}
                    </span>
                    <button
                        type="button"
                        className="text-brand hover:text-brand/80 min-h-6 px-1 text-xs font-medium transition-colors"
                        onClick={() => onChange(fillAllLeft(request.lots))}
                    >
                        {t('stock_return_all_left')}
                    </button>
                </div>
                <table aria-labelledby={titleId} className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr className="text-muted-foreground text-left">
                            <th scope="col" className={HEAD}>
                                {t('stock_lot_word')}
                            </th>
                            <th scope="col" className={HEAD}>
                                {t('stock_lots_col_held_at')}
                            </th>
                            <th scope="col" className={cn(HEAD, 'text-right')}>
                                {t('stock_return_col_out')}
                            </th>
                            <th scope="col" className={cn(HEAD, 'text-right')}>
                                {t('stock_return_col_back')}
                            </th>
                            <th scope="col" className={cn(HEAD, 'text-right')}>
                                {t('stock_return_col_now')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {request.lots.map((lot, i) => (
                            <LotReturnRow
                                key={lot.lot_id}
                                lot={lot}
                                over={lines[i].over}
                                value={qtys[lot.lot_id] ?? ''}
                                onChange={(value) => onChange({ ...qtys, [lot.lot_id]: value })}
                            />
                        ))}
                    </tbody>
                </table>
                <div className="bg-muted/40 flex items-center border-t px-3 py-2 text-sm">
                    <span className="flex-1">{t('stock_return_total')}</span>
                    <b className="tabular-nums">
                        {fmtN(total)} {unit ?? t('stock_units')}
                    </b>
                </div>
            </div>
            {error && <FormErrorBanner message={error} className="text-xs" />}
        </div>
    );
}

function LotReturnRow({
    lot,
    over,
    value,
    onChange,
}: {
    lot: ReturnableRequest['lots'][number];
    over: boolean;
    value: string;
    onChange: (value: string) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const overId = useId();
    const lotNo = lot.lot_no ?? t('stock_lot_before_tracking');

    return (
        <tr>
            <td className={CELL}>
                <div className="font-semibold whitespace-nowrap tabular-nums" translate="no">
                    {lotNo}
                </div>
                {over && (
                    <div id={overId} className="text-destructive text-xs">
                        {t('stock_return_max').replace('{n}', fmtN(lot.left))}
                    </div>
                )}
            </td>
            <td className={CELL}>{lot.warehouse}</td>
            <td className={cn(CELL, 'text-right tabular-nums')}>{fmtN(lot.issued)}</td>
            <td className={cn(CELL, 'text-muted-foreground text-right tabular-nums')}>{fmtN(lot.returned)}</td>
            <td className={cn(CELL, 'py-1.5 text-right')}>
                <Input
                    name={`lots[${lot.lot_id}]`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    value={value}
                    disabled={lot.left === 0}
                    aria-label={`${t('stock_return_col_now')} ${lotNo}`}
                    aria-invalid={over || undefined}
                    aria-describedby={over ? overId : undefined}
                    onChange={(e) => onChange(digitsOnly(e.target.value))}
                    className={cn(
                        'ml-auto h-8 w-16 text-right tabular-nums',
                        over && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                    )}
                />
            </td>
        </tr>
    );
}

// Serial item — tick the request's Serials coming back
function SerialReturnList({
    request,
    selected,
    onChange,
    error,
}: {
    request: ReturnableRequest;
    selected: Set<number>;
    onChange: (ids: Set<number>) => void;
    error?: string;
}) {
    const t = useT();
    const titleId = useId();
    const serials = request.serials;
    const allPicked = serials.length > 0 && selected.size === serials.length;

    const toggle = (id: number) => {
        const next = new Set(selected);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        onChange(next);
    };

    if (serials.length === 0) {
        return (
            <EmptyState
                kind="pick"
                title={t('stock_empty_movement_return_serials')}
                hint={t('stock_empty_movement_return_serials_hint')}
                className="min-h-0 rounded-md border border-dashed py-4"
            />
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span id={titleId} className="text-muted-foreground text-xs font-semibold">
                    {t('stock_return_pick')}
                </span>
                <button
                    type="button"
                    className="text-brand hover:text-brand/80 min-h-6 px-1 text-xs font-medium transition-colors"
                    onClick={() => onChange(allPicked ? new Set() : new Set(serials.map((s) => s.id)))}
                >
                    {allPicked ? t('stock_return_select_none') : t('stock_return_select_all')}
                </button>
            </div>
            <div role="group" aria-labelledby={titleId} className="max-h-52 space-y-1 overflow-y-auto">
                {serials.map((s) => {
                    const checked = selected.has(s.id);
                    return (
                        <label
                            key={s.id}
                            className={cn(
                                'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                                checked ? 'border-brand/40 bg-brand/5' : 'border-border hover:bg-muted/50',
                            )}
                        >
                            <input
                                name="serial_ids"
                                type="checkbox"
                                className="accent-brand h-4 w-4 shrink-0 rounded"
                                checked={checked}
                                onChange={() => toggle(s.id)}
                            />
                            <span className="text-sm" translate="no">
                                {s.serial}
                            </span>
                            <span className="text-muted-foreground ml-auto text-xs tabular-nums" translate="no">
                                {s.lot_no ?? t('stock_lot_before_tracking')}
                            </span>
                            {checked && <Check className="text-brand h-3.5 w-3.5" aria-hidden />}
                        </label>
                    );
                })}
            </div>
            {error && <FormErrorBanner message={error} className="text-xs" />}
        </div>
    );
}
