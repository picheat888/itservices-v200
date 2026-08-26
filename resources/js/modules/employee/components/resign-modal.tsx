import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, Box, ChevronLeft, ChevronRight, Laptop, Tag, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EmployeeHeldAsset } from '../api/employeeApi';
import { useEmployeeAssets, useEmployeeMutations } from '../hooks/use-employees';
import { HELD_STATUS_META } from '../lib/held-assets';

/** Equipment rows shown at once. The panel holds this many so paging never resizes the dialog. */
const ASSETS_PER_PAGE = 4;

export function ResignModal({ employee, onClose, onDone }: { employee: Employee | null; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { resign } = useEmployeeMutations();
    const [reason, setReason] = useState('');
    const [lastDay, setLastDay] = useState('');
    const [errors, setErrors] = useState<{ lastDay?: string; reason?: string }>({});
    // Catch-all for a failure that belongs to no single field (a rejected save), shown as the
    // shake banner the credential modals use. Without it a 422 leaves the dialog looking idle.
    const [formError, setFormError] = useState('');
    const [page, setPage] = useState(1);

    // Retain the last employee so the dialog stays drawn while Radix animates it closed —
    // without this the name, department and whole equipment list blank out on the way out.
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // What this person still has in hand. Same query key the detail drawer's Assets tab uses,
    // so opening Resign from the drawer reads the cache instead of refetching. Gated by
    // employees.view — the permission that also guards the list the Resign button sits in —
    // but a 403 or a dropped connection still has to read as "we do not know", never as
    // "nothing to return".
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

    const submit = async () => {
        const e: typeof errors = {};
        if (!lastDay) e.lastDay = t('resign_err_lastday');
        if (!reason.trim()) e.reason = t('resign_err_reason');
        setErrors(e);
        // Marking a field red is only half the job — put the caret in the first one that
        // needs an answer, the same as every other form in the app.
        if (Object.keys(e).length) {
            focusFirstError(e as Record<string, string>);
            return;
        }

        if (!employee) return;
        setFormError('');
        try {
            await resign.mutateAsync({ id: employee.id, reason, lastDay });
            onDone();
        } catch (err: unknown) {
            const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
            setFormError(data?.message ?? t('resign_err_failed'));
        }
    };

    const name = shown ? (lang === 'th' ? (shown.name_th ?? shown.name) : shown.name) : '';
    const department = shown ? (lang === 'th' ? (shown.department_th ?? shown.department) : shown.department) : null;

    const pageCount = Math.max(1, Math.ceil(heldAssets.length / ASSETS_PER_PAGE));
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * ASSETS_PER_PAGE;
    const pageRows = heldAssets.slice(start, start + ASSETS_PER_PAGE);

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            {/* No overflow on DialogContent, ever. DateInput portals its calendar INTO this node
                (the modal guard would otherwise eat its clicks), and the centering transform makes
                this element the containing block for that fixed-position popper — so any overflow
                other than visible turns the calendar into scrollable content instead of letting it
                float clear. The scrolling happens one level down, on the body wrapper, which the
                calendar is NOT inside. */}
            <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl flex-col">
                <DialogHeader>
                    <div className="flex items-start gap-4">
                        <AlertTriangle className="mt-0.5 h-11 w-11 shrink-0 stroke-[1.75] text-amber-500" />
                        <div className="min-w-0">
                            <DialogTitle className="text-2xl leading-tight tracking-tight">{t('resign_title')}</DialogTitle>
                            <DialogDescription className="mt-1.5 text-[15px]">{t('resign_desc')}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body — the only scroll container. On a phone the two columns stack past the
                    viewport, and without this the footer would sit outside the dialog box with
                    no way to reach it.

                    `overflow-y-auto` makes the browser clip the x-axis too, and the fields sit
                    flush with this box on the left, right and bottom — so their 3px focus ring,
                    which is painted OUTSIDE the border box, was being sliced off on three sides.
                    The negative margins widen the clip box by 8px and the matching padding puts
                    the content back where it was, so nothing moves and the ring has room. */}
                <div className="-mx-2 -mb-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-2">
                    <div className="flex items-center gap-2.5 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{t('resign_warn')}</span>
                    </div>

                    {formError && (
                        <div key={formError} className="bg-destructive/10 text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm">
                            {formError}
                        </div>
                    )}

                    {/* Left: what is being recorded. Right: what leaves with them — beside the
                        confirm button rather than below it. Grid items stretch, so the two columns
                        always end level whichever one is taller. */}
                    <div className="grid gap-7 md:grid-cols-2">
                        <section className="flex flex-col">
                            <h3 className="mb-3.5 text-lg font-bold tracking-tight">{t('resign_section_details')}</h3>

                            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
                                <ReadOnlyField label={t('resign_f_name')} value={name} />
                                <ReadOnlyField label={t('resign_f_code')} value={shown?.code ?? null} mono />
                                <ReadOnlyField label={t('position')} value={shown?.position ?? null} />
                                <ReadOnlyField label={t('department')} value={department} />
                            </div>

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
                                    placeholder={
                                        lang === 'th' ? 'เช่น โอนย้ายตำแหน่ง ลาออกโดยสมัครใจ ฯลฯ' : 'e.g. Voluntary resignation, role change…'
                                    }
                                />
                            </Field>
                        </section>

                        <section className="flex min-w-0 flex-col">
                            <h3 className="mb-3.5 text-lg font-bold tracking-tight">{t('resign_assets_to_return')}</h3>

                            <div className="mb-2.5 flex items-center justify-between gap-3">
                                <span className="text-muted-foreground text-sm">{t('resign_assets_caption')}</span>
                                <HeldAssetsCount count={heldAssets.length} loading={assetsLoading} failed={assetsFailed} />
                            </div>

                            {/* One border owns the whole zone, so a person holding a single device
                                reads as a short list inside a defined panel rather than a lone row
                                stranded above empty space. */}
                            <div className="border-border flex flex-1 flex-col overflow-hidden rounded-xl border">
                                <HeldAssetsList assets={pageRows} loading={assetsLoading} failed={assetsFailed} lang={lang} />
                                {/* Whichever column is naturally shorter stretches: the reason box
                                    on the left, this spacer on the right. Keeping the slack here
                                    rather than in the row list is what stops the last row from
                                    swallowing it and reading double-height. */}
                                <div className="flex-1" />

                                {pageCount > 1 && (
                                    <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-3 py-2 text-sm">
                                        <span>
                                            {start + 1}&ndash;{Math.min(start + ASSETS_PER_PAGE, heldAssets.length)} {lang === 'th' ? 'จาก' : 'of'}{' '}
                                            {heldAssets.length}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setPage(Math.max(1, safePage - 1))}
                                                disabled={safePage <= 1}
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
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={resign.isPending}>
                        <UserMinus className="h-4 w-4" />
                        {t('resign_submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** A label with a value the resignation cannot change — who this decision is about. */
function ReadOnlyField({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <Label className="text-muted-foreground">{label}</Label>
            <div className={cn('mt-1.5 truncate text-[15px] font-semibold', mono && 'font-mono text-sm')}>{value || '—'}</div>
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

    // Amber only when something is genuinely outstanding — a clean leaver should not be
    // dressed up as a problem.
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

/**
 * One page of outstanding equipment, drawn inside the panel that owns the zone — so the rows
 * carry no border of their own, only hairlines between them.
 */
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
                const type = (lang === 'th' ? (a.type_th ?? a.type) : a.type) ?? '—';
                return (
                    <div key={a.id} className="flex h-16 items-center gap-3 px-3">
                        <div className="bg-accent text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                            <Laptop className="h-4 w-4" />
                        </div>
                        {/* Two lines, each with what identifies the device on the left and what
                            labels the physical unit on the right: model over serial, type/status
                            over the asset tag. Keeping both codes in one right-hand column gives
                            the model room to breathe instead of truncating mid-name. */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.model ?? a.asset_code}</span>
                                <span className="text-muted-foreground shrink-0 font-mono text-xs">{a.serial ?? a.asset_code}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                                <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 text-xs">
                                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta?.dot ?? 'bg-muted-foreground')} />
                                    <span className="truncate">
                                        {type} · {meta ? t(meta.key) : a.status}
                                    </span>
                                </span>
                                {a.tag && (
                                    <span className="bg-brand/10 text-brand inline-flex max-w-36 shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium">
                                        <Tag className="h-3 w-3 shrink-0 opacity-70" />
                                        <span className="truncate">{a.tag}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            {/* Empty slots pad a short page out to a full one, the same way the shared DataTable
                pins filler rows. Without them the panel's leftover height pools under the last
                row — which has no divider beneath it — and that row reads as twice the height
                of the ones above it. */}
            {Array.from({ length: Math.max(0, ASSETS_PER_PAGE - assets.length) }).map((_, i) => (
                <div key={`slot-${i}`} className="h-16" />
            ))}
        </div>
    );
}
