import { useT } from '@/lang';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyPane } from '@/shared/components/empty-pane';
import { Field } from '@/shared/components/field';
import { InfoPopover } from '@/shared/components/info-popover';
import { RecordStamps } from '@/shared/components/record-stamps';
import { SaveButton } from '@/shared/components/save-button';
import { StatCard } from '@/shared/components/stat-card';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDialogParam } from '@/shared/hooks/use-dialog-param';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useRecordView } from '@/shared/hooks/use-record-view';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import {
    Archive,
    Bell,
    BellOff,
    CalendarClock,
    Inbox,
    KeyRound,
    Loader2,
    Package,
    PenLine,
    RotateCcw,
    Search,
    Send,
    ShieldAlert,
    TriangleAlert,
    Users,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { NotificationTemplate } from '../api/notificationApi';
import { NOTIFICATION_GROUPS, notificationGroupLabel } from '../groups';
import { useNotificationTemplateMutations, useNotificationTemplates } from '../hooks/use-notifications';

// Icon per module, matching the sidebar
const MODULE_ICON: Record<string, LucideIcon> = {
    employees: Users,
    access: ShieldAlert,
    contracts: CalendarClock,
    stock: Archive,
    requests: Inbox,
    assets: Package,
    tickets: Wrench,
    system: KeyRound,
};

// Stand-ins for placeholders in the preview: plain values, or a lang key when the value is UI text
const SAMPLE: Record<string, string | { key: string }> = {
    '{days}': '3',
    '{step}': { key: 'notification_sample_step' },
    '{actor}': 'Anong Wattana',
    '{remark}': { key: 'notification_sample_remark' },
    '{ticket}': 'TKT-2856',
    '{count}': '3',
    '{total}': '4',
    '{grants}': '2',
    '{owned}': '2',
    '{name}': 'Somchai Suksawat',
    '{from}': 'Anong Wattana',
    '{to}': 'Somchai Suksawat',
    '{format}': 'PDF',
};

/** Fill every placeholder with its stand-in. */
function withSamples(message: string, t: (key: string) => string): string {
    return Object.entries(SAMPLE).reduce((text, [token, value]) => text.split(token).join(typeof value === 'string' ? value : t(value.key)), message);
}

/** The i18n suffix for a notification: its catalogue key without the `notif_` prefix. */
const suffix = (key: string) => key.replace(/^notif_/, '');

/** The placeholders this message uses, in the order they appear. */
function placeholdersIn(message: string): string[] {
    return [...new Set(message.match(/\{[a-z_]+\}/g) ?? [])];
}

/** How the notification will look in the tray, with its placeholders filled in. */
function BellPreview({ bell, message }: { bell: NotificationTemplate; message: string }) {
    const t = useT();
    const Icon = MODULE_ICON[bell.module] ?? Bell;

    return (
        <div className="bg-muted/40 rounded-lg border p-3">
            <div className="flex items-start gap-3">
                <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm leading-snug font-semibold">{t(`notification_name_${suffix(bell.key)}`)}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">{withSamples(message, t) || '—'}</div>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">{t('notification_now')}</span>
            </div>
        </div>
    );
}

/** Reword one notification, and decide whether it fires at all. */
function NotificationEditDialog({ open, bell, onClose }: { open: boolean; bell: NotificationTemplate | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { update, reset, test } = useNotificationTemplateMutations();
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const submitting = useRef(false);

    const [en, setEn] = useState('');
    const [th, setTh] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [saved, setSaved] = useState(false);

    // Re-seed on open or a different notification only, so a list refetch keeps what is typed
    useEffect(() => {
        if (!open || !bell) return;
        setEn(bell.message_en);
        setTh(bell.message_th);
        setEnabled(bell.enabled);
        setSaved(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, bell?.key]);

    const isDirty = open && !saved && !!bell && (en !== bell.message_en || th !== bell.message_th || enabled !== bell.enabled);
    const guardClose = useDiscardGuard(isDirty);

    const busy = update.isPending || reset.isPending || test.isPending;
    const name = bell ? t(`notification_name_${suffix(bell.key)}`) : '';

    const save = async () => {
        if (!bell || submitting.current || saved || !en.trim() || !th.trim()) return;
        submitting.current = true;
        try {
            await update.mutateAsync({ key: bell.key, payload: { message_en: en.trim(), message_th: th.trim(), enabled } });
            setSaved(true);
            closeAfterSave();
        } catch {
            // The mutation's onError shows the toast
        } finally {
            submitting.current = false;
        }
    };

    const resetToStandard = async () => {
        if (!bell || submitting.current) return;
        const confirmed = await confirm({
            variant: 'warn',
            title: t('notification_reset_confirm_title'),
            description: t('notification_reset_confirm_desc'),
            entity: { name },
            confirmText: t('notification_reset'),
        });
        if (!confirmed) return;
        submitting.current = true;
        try {
            await reset.mutateAsync(bell.key);
            onClose();
        } catch {
            // The mutation's onError shows the toast
        } finally {
            submitting.current = false;
        }
    };

    const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
        }
    };

    return (
        <Dialog open={open && !!bell} onOpenChange={(o) => !o && guardClose(onClose)}>
            {bell && (
                <DialogContent className="max-w-2xl">
                    <FocusDialogHeader
                        icon={PenLine}
                        eyebrow={t(notificationGroupLabel(bell.module))}
                        title={name}
                        subtitle={t(`notification_when_${suffix(bell.key)}`)}
                        headerRight={
                            bell.updated_by_name && (
                                <RecordStamps className="text-right" updatedAt={bell.updated_at} updatedBy={bell.updated_by_name} />
                            )
                        }
                    />

                    <div className="mt-4 space-y-5">
                        {/* On / off */}
                        <div className="flex items-start gap-3 rounded-lg border p-3">
                            <Switch checked={enabled} onChange={setEnabled} disabled={saved} aria-label={`${t('notification_toggle')} ${name}`} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">{enabled ? t('notification_on') : t('notification_off')}</div>
                                <div className="text-muted-foreground mt-0.5 text-xs">
                                    {t('notification_audience')}: {t(`notification_who_${suffix(bell.key)}`)}
                                </div>
                            </div>
                        </div>

                        {!bell.has_email && !enabled && (
                            <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                <div className="flex-1">
                                    <div className="text-sm font-semibold">{t('notification_only_channel_title')}</div>
                                    <div className="mt-0.5 text-xs leading-relaxed">{t('notification_only_channel_body')}</div>
                                </div>
                            </div>
                        )}

                        <Field label={t('notification_message_en')} required>
                            <Input value={en} onChange={(e) => setEn(e.target.value)} onKeyDown={onEnter} maxLength={300} />
                        </Field>
                        <Field label={t('notification_message_th')} required>
                            <Input value={th} onChange={(e) => setTh(e.target.value)} onKeyDown={onEnter} maxLength={300} />
                        </Field>

                        {placeholdersIn(bell.message_en).length > 0 && (
                            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                                <span>{t('notification_variables')}:</span>
                                {placeholdersIn(bell.message_en).map((token) => (
                                    <code key={token} className="bg-accent text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
                                        {token}
                                    </code>
                                ))}
                            </div>
                        )}

                        <div>
                            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                                {t('notification_preview')}
                            </div>
                            <BellPreview bell={bell} message={lang === 'th' ? th : en} />
                        </div>
                    </div>

                    <div className="mt-6 flex flex-row gap-2">
                        {/* Test sends the saved wording */}
                        <Button variant="outline" onClick={() => test.mutate(bell.key)} disabled={busy || saved}>
                            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                            {t('notification_test')}
                        </Button>
                        <DisabledReason reason={bell.is_standard ? t('notification_already_standard') : null} label={t('notification_reset')}>
                            <Button variant="outline" onClick={resetToStandard} disabled={busy || saved || bell.is_standard}>
                                {reset.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                    <RotateCcw className="h-4 w-4" aria-hidden />
                                )}
                                {t('notification_reset')}
                            </Button>
                        </DisabledReason>
                        <div className="flex-1" />
                        <Button variant="outline" onClick={() => guardClose(onClose)} disabled={busy}>
                            {t('cancel')}
                        </Button>
                        <SaveButton
                            loading={update.isPending}
                            success={saved}
                            onClick={save}
                            disabled={reset.isPending || test.isPending || saved || !en.trim() || !th.trim()}
                        />
                    </div>
                </DialogContent>
            )}
        </Dialog>
    );
}

/** The four figures above the tab strip, rendered by the page beside the email ones. */
export function NotificationSettingsStats() {
    const t = useT();
    const { data, isLoading } = useNotificationTemplates();
    const figure = (value: number | undefined) => String(value ?? 0);

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('notification_stat_total')} value={figure(data?.stats.total)} icon={Bell} loading={isLoading} />
            <StatCard label={t('notification_stat_enabled')} value={figure(data?.stats.enabled)} icon={Bell} loading={isLoading} />
            <StatCard label={t('notification_stat_disabled')} value={figure(data?.stats.disabled)} icon={BellOff} loading={isLoading} />
            <StatCard label={t('notification_stat_edited')} value={figure(data?.stats.edited)} icon={PenLine} loading={isLoading} />
        </div>
    );
}

/** One module filter chip with its count. */
function ModuleChip({ label, count, selected, onSelect }: { label: string; count: number; selected: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={cn(
                'focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors outline-none focus-visible:ring-2',
                selected ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
        >
            {label}
            <span className="font-semibold tabular-nums">{count}</span>
        </button>
    );
}

/** The Notification tab of Email & Notifications: every in-app alert, reworded or switched off per row. */
export function NotificationSettingsPane() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data, isLoading } = useNotificationTemplates();
    const { update } = useNotificationTemplateMutations();
    // Module chip, search, page and rows-per-page live in the URL
    const list = useListParams();
    const search = list.get('search');
    const setSearch = (value: string) => list.setFilter('search', value);
    const setModule = (value: string) => list.setFilter('module', value);

    const all = useMemo(() => data?.data ?? [], [data]);

    // Editor open state lives in the URL (?dialog=<id>); Back closes it
    const ids = useMemo(() => all.map((n) => String(n.id)), [all]);
    const [editParam, setEditParam] = useDialogParam(ids);
    const editId = editParam === null ? null : Number(editParam);
    const live = editId === null ? null : (all.find((n) => n.id === editId) ?? null);
    const { record: editing } = useRecordView(editId, live);
    const openEditor = (n: NotificationTemplate) => setEditParam(String(n.id));

    // Chips in catalogue order, each with its count
    const modules = useMemo(() => {
        const counts: Record<string, number> = {};
        all.forEach((n) => {
            counts[n.module] = (counts[n.module] ?? 0) + 1;
        });

        const order = NOTIFICATION_GROUPS.map((g) => g.id);
        return Object.entries(counts).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    }, [all]);
    // An unknown ?module= reads as All once the list has loaded
    const urlModule = list.get('module');
    const module = !data || modules.some(([mod]) => mod === urlModule) ? urlModule : '';
    const isFiltered = module !== '' || search.trim() !== '';

    const rows = useMemo(() => {
        let list = module ? all.filter((n) => n.module === module) : all;
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((n) =>
                [t(`notification_name_${suffix(n.key)}`), n.key, n.message_en, n.message_th].join(' ').toLowerCase().includes(q),
            );
        }

        return list;
    }, [all, module, search, t]);

    const togglePending = (n: NotificationTemplate) => update.isPending && update.variables?.key === n.key;

    const columns: Column<NotificationTemplate>[] = [
        {
            key: 'code',
            header: t('notification_col_id'),
            className: 'w-[6%]',
            render: (n) => <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">{n.code}</span>,
        },
        {
            key: 'name',
            header: t('notification_col_name'),
            className: 'w-[24%] max-w-0',
            render: (n) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{t(`notification_name_${suffix(n.key)}`)}</span>
                        {!n.is_standard && (
                            <span className="shrink-0 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                {t('notification_modified')}
                            </span>
                        )}
                        {/* No email covers this event */}
                        {!n.has_email && (
                            <InfoPopover
                                label={t('notification_only_channel_title')}
                                isolate
                                openOnFocus
                                className="relative inline-flex shrink-0 rounded-full text-amber-700 before:absolute before:-inset-1.5 before:content-[''] dark:text-amber-400"
                                content={
                                    <>
                                        <div className="font-semibold">{t('notification_only_channel_title')}</div>
                                        <div className="mt-0.5">{t('notification_only_channel_body')}</div>
                                    </>
                                }
                            >
                                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                            </InfoPopover>
                        )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate text-xs">{n.key}</div>
                </div>
            ),
        },
        {
            // Both languages, always
            key: 'message',
            header: t('notification_col_message'),
            className: 'w-[30%] max-w-0',
            render: (n) => (
                <div className="min-w-0 space-y-0.5">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-muted-foreground shrink-0 text-xs tracking-wide">{t('notification_lang_en')}</span>
                        <span className="truncate text-xs">{n.message_en}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-muted-foreground shrink-0 text-xs tracking-wide">{t('notification_lang_th')}</span>
                        <span className="text-muted-foreground truncate text-xs">{n.message_th}</span>
                    </div>
                </div>
            ),
        },
        {
            key: 'trigger',
            header: t('notification_col_trigger'),
            className: 'w-[16%] max-w-0',
            hideBelow: 'lg',
            render: (n) => <span className="text-muted-foreground block truncate text-xs">{t(`notification_when_${suffix(n.key)}`)}</span>,
        },
        {
            key: 'audience',
            header: t('notification_col_audience'),
            className: 'w-[12%] max-w-0',
            hideBelow: 'lg',
            render: (n) => <span className="text-muted-foreground block truncate text-xs">{t(`notification_who_${suffix(n.key)}`)}</span>,
        },
        {
            key: 'last_sent',
            header: t('notification_col_last_sent'),
            className: 'w-[8%] whitespace-nowrap',
            render: (n) => (
                <span className="text-muted-foreground text-xs tabular-nums">{relativeTime(n.last_sent_at, lang, t('notification_never_sent'))}</span>
            ),
        },
        {
            key: 'enabled',
            header: t('notification_col_on'),
            className: 'w-[2%]',
            // Keeps its own click inside the clickable row
            render: (n) => (
                <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                    <Switch
                        checked={n.enabled}
                        disabled={togglePending(n)}
                        aria-label={`${t('notification_toggle')} ${t(`notification_name_${suffix(n.key)}`)}`}
                        onChange={(next) =>
                            update.mutate({ key: n.key, payload: { message_en: n.message_en, message_th: n.message_th, enabled: next } })
                        }
                    />
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            className: 'w-[2%]',
            render: (n) => (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openEditor(n);
                        }}
                        aria-label={`${t('notification_edit')} ${t(`notification_name_${suffix(n.key)}`)}`}
                        className="text-muted-foreground hover:bg-accent hover:text-brand focus-visible:ring-ring/50 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
                    >
                        <PenLine className="h-4 w-4" aria-hidden />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-3 p-5">
            {/* Intro and search */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-muted-foreground text-xs">{t('notification_sub')}</div>
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" aria-hidden />
                    <Input
                        type="search"
                        name="notification-search"
                        autoComplete="off"
                        aria-label={t('notification_search_label')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('notification_search')}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Module filter chips */}
            <div className="flex flex-wrap gap-1.5">
                <ModuleChip label={t('notification_all_modules')} count={all.length} selected={module === ''} onSelect={() => setModule('')} />
                {modules.map(([mod, count]) => (
                    <ModuleChip
                        key={mod}
                        label={t(notificationGroupLabel(mod))}
                        count={count}
                        selected={module === mod}
                        onSelect={() => setModule(mod)}
                    />
                ))}
            </div>

            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(n) => n.key}
                loading={isLoading}
                rowHeight={58}
                onRowClick={openEditor}
                paging={list.table.paging}
                emptyState={<EmptyPane icon={Bell} text={isFiltered ? t('notification_empty') : t('notification_empty_none')} />}
            />

            <NotificationEditDialog open={editId !== null} bell={editing} onClose={() => setEditParam(null)} />
        </div>
    );
}
