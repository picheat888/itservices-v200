import { useT } from '@/lang';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { hasFieldError, refusalText } from '@/shared/lib/api-errors';
import { localName, localPair } from '@/shared/lib/local-name';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, Box, ChevronLeft, ChevronRight, Laptop, Loader2, Tag, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EmployeeHeldAsset } from '../api/employeeApi';
import { useEmployeeAssets, useEmployeeMutations } from '../hooks/use-employees';
import { HELD_STATUS_META } from '../lib/held-assets';

/** Equipment rows shown at once. The panel holds this many so paging never resizes the dialog. */
const ASSETS_PER_PAGE = 4;

export function ResignModal({ employee, onClose, onDone }: { employee: Employee | null; onClose: () => void; onDone: () => void }) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { resign } = useEmployeeMutations();
    const confirm = useConfirm();
    const [reason, setReason] = useState('');
    const [lastDay, setLastDay] = useState('');
    const [errors, setErrors] = useState<{ lastDay?: string; reason?: string }>({});
    // Banner for a failure that belongs to no single field
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);
    const [page, setPage] = useState(1);

    // Retain the last employee so content stays drawn during the close animation
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // Equipment still held; a failed load reads as "unknown", never as "nothing to return"
    const { data: heldAssets = [], isLoading: assetsLoading, isError: assetsFailed } = useEmployeeAssets(shown?.id ?? null);

    useEffect(() => {
        if (employee) {
            setReason('');
            setLastDay('');
            setErrors({});
            setFormError('');
            setPage(1);
        }
    }, [employee]);

    const isDirty = reason !== '' || lastDay !== '';
    const guardClose = useDiscardGuard(!!employee && isDirty);

    const joinedAt = shown?.joined_at ?? null;
    const beforeJoinText = joinedAt ? t('resign_err_before_join').replace('{date}', fmt.date(joinedAt)) : t('resign_err_before_join_plain');

    const submit = async () => {
        const e: typeof errors = {};
        if (!lastDay) e.lastDay = t('resign_err_lastday');
        else if (joinedAt && lastDay <= joinedAt) e.lastDay = beforeJoinText;
        if (!reason.trim()) e.reason = t('resign_err_reason');
        setErrors(e);
        if (Object.keys(e).length) {
            focusFirstError(e as Record<string, string>);
            return;
        }

        if (!employee) return;
        // Recording this recalls every device and tells IT, so it is confirmed once more
        const confirmed = await confirm({
            variant: 'danger',
            icon: UserMinus,
            title: t('resign_confirm_title'),
            description: t('resign_confirm_desc').replace('{date}', fmt.date(lastDay)),
            entity: { name, sub: employee.code },
            confirmText: t('resign_submit'),
        });
        if (!confirmed) return;

        setFormError('');
        try {
            await resign.mutateAsync({ id: employee.id, reason, lastDay });
            onDone();
        } catch (err: unknown) {
            if (hasFieldError(err, 'last_day')) {
                setErrors({ lastDay: beforeJoinText });
                focusFirstError({ lastDay: beforeJoinText });
                return;
            }
            setFormError(refusalText(err, t, 'resign_err_'));
            setFormErrorCount((n) => n + 1);
        }
    };

    const name = shown ? localName(shown, lang) : '';
    const department = shown ? localPair(shown.department, shown.department_th, lang) : null;

    const pageCount = Math.max(1, Math.ceil(heldAssets.length / ASSETS_PER_PAGE));
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * ASSETS_PER_PAGE;
    const pageRows = heldAssets.slice(start, start + ASSETS_PER_PAGE);

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && guardClose(onClose)}>
            {/* No overflow here: DateInput portals its calendar into this node; the body scrolls instead */}
            <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-4xl flex-col">
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        <AlertTriangle className="mt-0.5 h-11 w-11 shrink-0 stroke-[1.75] text-amber-500 dark:text-amber-400" />
                        <div className="min-w-0">
                            <DialogTitle className="text-2xl leading-tight tracking-tight">{t('resign_title')}</DialogTitle>
                            <DialogDescription className="mt-1.5 text-[15px]">{t('resign_desc')}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body: the only scroll container; -mx-2/px-2 leaves room for focus rings */}
                <div className="-mx-2 -mb-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-2">
                    <div className="flex items-center gap-2.5 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{t('resign_warn')}</span>
                    </div>

                    <FormErrorBanner message={formError} shakeKey={formErrorCount} />

                    {/* Left: what is recorded. Right: what leaves with them */}
                    <div className="grid gap-7 lg:grid-cols-2">
                        <section className="flex flex-col">
                            <h3 className="mb-3.5 text-lg font-bold tracking-tight">{t('resign_section_details')}</h3>

                            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
                                <ReadOnlyField label={t('resign_f_name')} value={name} />
                                <ReadOnlyField label={t('resign_f_code')} value={shown?.code ?? null} />
                                <ReadOnlyField label={t('position')} value={shown?.position ?? null} />
                                <ReadOnlyField label={t('department')} value={department} />
                            </dl>

                            <div className="mb-3.5">
                                <Field label={t('resign_last_day')} name="lastDay" required error={errors.lastDay}>
                                    <DateInput
                                        value={lastDay}
                                        onChange={(v) => {
                                            setLastDay(v);
                                            setErrors((p) => ({ ...p, lastDay: undefined }));
                                        }}
                                    />
                                </Field>
                            </div>

                            <Field label={t('resign_reason')} name="reason" required error={errors.reason} grow>
                                <Textarea
                                    value={reason}
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        setErrors((p) => ({ ...p, reason: undefined }));
                                    }}
                                    className="min-h-24 resize-none"
                                    maxLength={500}
                                    placeholder={t('resign_reason_ph')}
                                />
                            </Field>
                        </section>

                        <section className="flex min-w-0 flex-col">
                            <h3 className="mb-3.5 text-lg font-bold tracking-tight">{t('resign_assets_to_return')}</h3>

                            <div className="mb-2.5 flex items-center justify-between gap-3">
                                <span className="text-muted-foreground text-sm">{t('resign_assets_caption')}</span>
                                <HeldAssetsCount count={heldAssets.length} loading={assetsLoading} failed={assetsFailed} />
                            </div>

                            {/* One border owns the whole zone */}
                            <div className="border-border flex flex-1 flex-col overflow-hidden rounded-xl border">
                                <HeldAssetsList assets={pageRows} loading={assetsLoading} failed={assetsFailed} lang={lang} />
                                {/* Spacer takes the slack so the last row keeps its height */}
                                <div className="flex-1" />

                                {pageCount > 1 && (
                                    <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-3 py-2 text-sm">
                                        <span>
                                            {start + 1}&ndash;{Math.min(start + ASSETS_PER_PAGE, heldAssets.length)} {t('emp_of')} {heldAssets.length}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setPage(Math.max(1, safePage - 1))}
                                                disabled={safePage <= 1}
                                                aria-label={t('page_prev')}
                                                className="border-border hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </button>
                                            <span className="text-foreground px-1 font-medium">
                                                {safePage} / {pageCount}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                                                disabled={safePage >= pageCount}
                                                aria-label={t('page_next')}
                                                className="border-border hover:bg-accent flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={resign.isPending}>
                        {resign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                        {resign.isPending ? t('saving') : t('resign_submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** A label with a value the resignation cannot change — who this decision is about. */
function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="min-w-0">
            <dt className="text-muted-foreground text-sm leading-none font-medium">{label}</dt>
            <dd className={'mt-1.5 truncate text-[15px] font-semibold'}>{value || '—'}</dd>
        </div>
    );
}

/** The "Assets to return" figure: a pill reading `3 items`, or why there is no figure. */
function HeldAssetsCount({ count, loading, failed }: { count: number; loading: boolean; failed: boolean }) {
    const t = useT();

    if (loading) {
        return <div className="bg-muted h-[30px] w-24 animate-pulse rounded-md" />;
    }

    if (failed) {
        return (
            <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium">
                <Box className="h-3.5 w-3.5" />
                {t('resign_assets_unavailable')}
            </span>
        );
    }

    // Amber only when something is outstanding
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium',
                count > 0 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground',
            )}
        >
            <Box className="h-3.5 w-3.5" />
            {count > 0 ? `${count} ${t(count === 1 ? 'filter_item' : 'filter_items')}` : t('resign_assets_none')}
        </span>
    );
}

/** One page of outstanding equipment, rows parted by hairlines inside the panel. */
function HeldAssetsList({ assets, loading, failed, lang }: { assets: EmployeeHeldAsset[]; loading: boolean; failed: boolean; lang: string }) {
    const t = useT();

    if (loading) {
        return (
            <div className="divide-border divide-y">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex h-16 items-center gap-3 px-3">
                        <div className="bg-muted h-9 w-9 shrink-0 animate-pulse rounded-lg" />
                        <div className="flex-1 space-y-1.5">
                            <div className="bg-muted h-3 w-32 animate-pulse rounded" />
                            <div className="bg-muted h-2.5 w-20 animate-pulse rounded" />
                        </div>
                        <div className="bg-muted h-5 w-16 animate-pulse rounded-full" />
                    </div>
                ))}
            </div>
        );
    }

    if (failed || assets.length === 0) {
        return (
            <div className="text-muted-foreground flex min-h-65 flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center text-sm">
                <Box className="h-5 w-5" />
                {failed ? t('resign_assets_unavailable') : t('resign_assets_none')}
            </div>
        );
    }

    return (
        <div className="divide-border divide-y">
            {assets.map((a) => {
                const meta = HELD_STATUS_META[a.status] ?? null;
                const type = localPair(a.type, a.type_th, lang) ?? '—';
                return (
                    <div key={a.id} className="flex h-16 items-center gap-3 px-3">
                        <div className="bg-accent text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                            <Laptop className="h-4 w-4" />
                        </div>
                        {/* Model over serial, type and status over the asset tag */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.model ?? a.asset_code}</span>
                                <span className="text-muted-foreground shrink-0 text-xs">{a.serial ?? a.asset_code}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                                <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                                    {/* Type, then the status with its colour dot in front of it. */}
                                    <span className="shrink-0">{type}</span>
                                    <span className={cn('ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full', meta?.dot ?? 'bg-muted-foreground')} />
                                    <span className="truncate">{meta ? t(meta.key) : a.status}</span>
                                </span>
                                {a.tag && (
                                    <span className="bg-brand/10 text-brand-ink inline-flex max-w-36 shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                                        <Tag className="h-3 w-3 shrink-0" aria-hidden />
                                        <span className="truncate">{a.tag}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            {/* Filler slots pad a short page to a full one */}
            {Array.from({ length: Math.max(0, ASSETS_PER_PAGE - assets.length) }).map((_, i) => (
                <div key={`slot-${i}`} className="h-16" />
            ))}
        </div>
    );
}
