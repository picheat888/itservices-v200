import { useT } from '@/lang';
import { DataTable, type Column } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SettingToggle } from '@/shared/components/setting-toggle';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
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
    Loader2,
    Package,
    PenLine,
    RotateCcw,
    Save,
    Search,
    Send,
    ShieldAlert,
    TriangleAlert,
    Users,
    Wrench,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { NotificationTemplate } from '../api/notificationApi';
import { useNotificationTemplateMutations, useNotificationTemplates } from '../hooks/use-notifications';

/**
 * Icon per module, mirroring the sidebar so a notification is recognised by the same mark as the
 * page it comes from.
 */
const MODULE_ICON: Record<string, LucideIcon> = {
    employees: Users,
    access: ShieldAlert,
    contracts: CalendarClock,
    stock: Archive,
    requests: Inbox,
    assets: Package,
    tickets: Wrench,
};

/**
 * Stand-ins for the placeholders a notification can carry, so the preview reads as a sentence
 * rather than as a template. Same idea as the email editor's sample variables.
 */
const SAMPLE: Record<string, string> = {
    '{days}': '3',
    '{step}': 'Department manager',
    '{actor}': 'Anong Wattana',
    '{remark}': 'not on the current agreement',
    '{ticket}': 'TKT-2856',
    '{count}': '3',
    '{total}': '4',
    '{grants}': '2',
    '{owned}': '2',
    '{name}': 'Somchai Suksawat',
    '{from}': 'Anong Wattana',
};

/** Fill every placeholder with its stand-in — what the reader will actually see. */
function withSamples(message: string): string {
    return Object.entries(SAMPLE).reduce((text, [token, value]) => text.split(token).join(value), message);
}

/**
 * The i18n suffix for a notification — its catalogue key without the `notif_` prefix.
 *
 * The name, the trigger and the audience are UI text and live in lang/<locale>/notification.ts
 * (notification_name_* / notification_when_* / notification_who_*), not in the API payload: the server has no business
 * knowing which language the reader wants, and adding a language must stay a matter of adding
 * one lang folder. NotificationTemplateTest checks every catalogue key has all three on both sides.
 */
const suffix = (key: string) => key.replace(/^notif_/, '');

/** The placeholders this message uses, in the order they appear. */
function placeholdersIn(message: string): string[] {
    return [...new Set(message.match(/\{[a-z_]+\}/g) ?? [])];
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone?: 'amber' }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span
                    className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg',
                        tone === 'amber' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-brand/10 text-brand',
                    )}
                >
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
        </Card>
    );
}

/**
 * How the notification will look in the tray: the module's mark, the notification's name as the headline,
 * and the message underneath with its placeholders filled in.
 *
 * It mirrors the dropdown's row rather than being rendered by it — the dropdown needs a real
 * notification with a payload, and there is none to show here. What it does guarantee is the
 * thing being edited: the exact sentence a reader ends up with.
 */
function BellPreview({ bell, message }: { bell: NotificationTemplate; message: string }) {
    const t = useT();
    const Icon = MODULE_ICON[bell.module] ?? Bell;

    return (
        <div className="bg-muted/40 rounded-lg border p-3">
            <div className="flex items-start gap-3">
                <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm leading-snug font-semibold">{t(`notification_name_${suffix(bell.key)}`)}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">{withSamples(message) || '—'}</div>
                </div>
                <span className="text-muted-foreground shrink-0 text-[11px]">now</span>
            </div>
        </div>
    );
}

/** Reword one notification, and decide whether it fires at all. */
function NotificationEditDialog({ bell, onClose }: { bell: NotificationTemplate | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { update, reset, test } = useNotificationTemplateMutations();

    const [en, setEn] = useState('');
    const [th, setTh] = useState('');
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (!bell) return;
        setEn(bell.message_en);
        setTh(bell.message_th);
        setEnabled(bell.enabled);
    }, [bell]);

    if (!bell) return null;

    const tokens = placeholdersIn(bell.message_en);
    const busy = update.isPending || reset.isPending || test.isPending;
    const preview = lang === 'th' ? th : en;

    const save = async () => {
        await update.mutateAsync({ key: bell.key, payload: { message_en: en.trim(), message_th: th.trim(), enabled } });
        onClose();
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <FocusDialogHeader
                    icon={PenLine}
                    eyebrow={bell.module}
                    title={t(`notification_name_${suffix(bell.key)}`)}
                    subtitle={t(`notification_when_${suffix(bell.key)}`)}
                />

                <div className="mt-4 space-y-5">
                    {/* Off means nobody gets this alert at all — say so where the switch is. */}
                    <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Switch checked={enabled} onChange={setEnabled} aria-label={t('notification_col_on')} />
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{enabled ? t('notification_on') : t('notification_off')}</div>
                            <div className="text-muted-foreground mt-0.5 text-xs">
                                {t('notification_audience')}: {t(`notification_who_${suffix(bell.key)}`)}
                            </div>
                        </div>
                    </div>

                    {!bell.has_email && !enabled && (
                        <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="flex-1">
                                <div className="text-sm font-semibold">{t('notification_only_channel_title')}</div>
                                <div className="mt-0.5 text-xs leading-relaxed">{t('notification_only_channel_body')}</div>
                            </div>
                        </div>
                    )}

                    <Field label={t('notification_message_en')} required>
                        <Input value={en} onChange={(e) => setEn(e.target.value)} maxLength={300} />
                    </Field>
                    <Field label={t('notification_message_th')} required>
                        <Input value={th} onChange={(e) => setTh(e.target.value)} maxLength={300} />
                    </Field>

                    {tokens.length > 0 && (
                        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                            <span>{t('notification_variables')}:</span>
                            {tokens.map((token) => (
                                <code key={token} className="bg-accent text-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
                                    {token}
                                </code>
                            ))}
                        </div>
                    )}

                    <div>
                        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('notification_preview')}</div>
                        <BellPreview bell={bell} message={preview} />
                    </div>
                </div>

                <div className="mt-6 flex flex-row gap-2">
                    {/* Sends the SAVED wording, not what is typed but unsaved — a sample of
                        something nobody has agreed to yet would be a confusing thing to receive. */}
                    <Button variant="outline" onClick={() => test.mutate(bell.key)} disabled={busy}>
                        {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('notification_test')}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => reset.mutateAsync(bell.key).then(onClose)}
                        disabled={busy || bell.is_standard}
                        title={bell.is_standard ? t('notification_already_standard') : undefined}
                    >
                        <RotateCcw className="h-4 w-4" />
                        {t('notification_reset')}
                    </Button>
                    <div className="flex-1" />
                    <Button variant="outline" onClick={onClose} disabled={busy}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={save} disabled={busy || !en.trim() || !th.trim()}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * The four figures above the tab strip, in the same place the email ones sit.
 *
 * Rendered by the page rather than by the pane below, so switching tab swaps one row of
 * cards for another instead of stacking a second row under the first. Both read the same
 * query, which React Query serves once.
 */
export function NotificationSettingsStats() {
    const t = useT();
    const { data } = useNotificationTemplates();

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('notification_stat_total')} value={data?.stats.total ?? 0} icon={Bell} />
            <StatCard label={t('notification_stat_enabled')} value={data?.stats.enabled ?? 0} icon={Bell} />
            <StatCard label={t('notification_stat_edited')} value={data?.stats.edited ?? 0} icon={PenLine} />
            <StatCard label={t('notification_stat_only_channel')} value={data?.stats.only_channel ?? 0} icon={BellOff} tone="amber" />
        </div>
    );
}

/**
 * The Notification tab of Email & Notifications.
 *
 * In-app alerts used to be the one thing nobody could configure: they fired whenever their
 * event happened and said whatever was compiled into the bundle. This lists every one of
 * them with what makes it fire and who receives it, and lets an administrator reword it in
 * both languages or switch it off.
 */
export function NotificationSettingsPane() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data, isLoading } = useNotificationTemplates();
    const { update } = useNotificationTemplateMutations();
    const [editing, setEditing] = useState<NotificationTemplate | null>(null);
    const [module, setModule] = useState('');
    const [search, setSearch] = useState('');

    const all = useMemo(() => data?.data ?? [], [data]);

    /** Module chips carry their own count, the way the Email tab's do. */
    const modules = useMemo(() => {
        const counts: Record<string, number> = {};
        all.forEach((n) => {
            counts[n.module] = (counts[n.module] ?? 0) + 1;
        });

        return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    }, [all]);

    /**
     * Display id, mirroring the email templates' ET-##.
     *
     * Derived from catalogue order rather than stored: these rows are keyed by a string, and a
     * number that only exists to be read aloud ("check NT-07") does not need a column in the
     * database to be stable — the catalogue's order is.
     */
    const codeOf = useMemo(() => {
        const map: Record<string, string> = {};
        all.forEach((n, i) => {
            map[n.key] = `NT-${String(i + 1).padStart(2, '0')}`;
        });

        return map;
    }, [all]);

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

    // The Email tab's rhythm — ID, name, key, badge, last sent, switch, edit — with three
    // columns that email has no equivalent for and a notification cannot do without: what the
    // reader will actually see, when it fires, and who gets it. Losing them to symmetry made
    // the table look right and answer nothing.
    const columns: Column<NotificationTemplate>[] = [
        {
            key: 'code',
            header: 'ID',
            className: 'w-[6%]',
            render: (n) => <span className="text-muted-foreground font-mono text-xs">{codeOf[n.key]}</span>,
        },
        {
            key: 'name',
            header: t('notification_col_name'),
            className: 'w-[20%] max-w-0',
            render: (n) => (
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{t(`notification_name_${suffix(n.key)}`)}</span>
                        {!n.is_standard && (
                            <span className="shrink-0 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                {t('notification_modified')}
                            </span>
                        )}
                        {/* The event this is the only announcement of — switching it off silences it. */}
                        {!n.has_email && (
                            <span title={t('notification_only_channel_title')}>
                                <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            </span>
                        )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate font-mono text-[10.5px]">{n.key}</div>
                </div>
            ),
        },
        {
            /**
             * Both languages, always — not the reader's own.
             *
             * This column is the thing being administered: an admin rewording the Thai has to
             * see the English it has to keep pace with, and showing only the current locale hid
             * exactly half of what they are responsible for.
             */
            key: 'message',
            header: t('notification_col_message'),
            className: 'w-[26%] max-w-0',
            render: (n) => (
                <div className="min-w-0 space-y-0.5">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-muted-foreground/70 shrink-0 font-mono text-[9.5px] tracking-wide uppercase">en</span>
                        <span className="truncate text-xs">{n.message_en}</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-muted-foreground/70 shrink-0 font-mono text-[9.5px] tracking-wide uppercase">th</span>
                        <span className="text-muted-foreground truncate text-xs">{n.message_th}</span>
                    </div>
                </div>
            ),
        },
        {
            key: 'trigger',
            header: t('notification_col_trigger'),
            className: 'w-[20%] max-w-0',
            render: (n) => <span className="text-muted-foreground block truncate text-xs">{t(`notification_when_${suffix(n.key)}`)}</span>,
        },
        {
            key: 'audience',
            header: t('notification_col_audience'),
            className: 'w-[14%] max-w-0',
            render: (n) => <span className="text-muted-foreground block truncate text-xs">{t(`notification_who_${suffix(n.key)}`)}</span>,
        },
        {
            key: 'last_sent',
            header: t('notification_col_last_sent'),
            className: 'w-[8%]',
            render: (n) => (
                <span className="text-muted-foreground font-mono text-xs">{relativeTime(n.last_sent_at, lang, t('notification_never_sent'))}</span>
            ),
        },
        {
            key: 'enabled',
            header: t('notification_col_on'),
            className: 'w-[5%]',
            // The toggle lives inside a clickable row, so it has to keep its own click.
            render: (n) => (
                <span onClick={(e) => e.stopPropagation()}>
                    <SettingToggle
                        on={n.enabled}
                        label={t(`notification_name_${suffix(n.key)}`)}
                        onClick={() =>
                            update.mutate({ key: n.key, payload: { message_en: n.message_en, message_th: n.message_th, enabled: !n.enabled } })
                        }
                    />
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            className: 'w-[6%]',
            render: (n) => (
                <button
                    type="button"
                    onClick={() => setEditing(n)}
                    className="text-muted-foreground hover:text-brand"
                    aria-label={t('notification_edit')}
                >
                    <PenLine className="h-4 w-4" />
                </button>
            ),
        },
    ];

    return (
        <div className="space-y-3 p-5">
            {/* No heading: the tab above already named this half of the page. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-muted-foreground text-xs">{t('notification_sub')}</div>
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('notification_search')} className="pl-9" />
                </div>
            </div>

            {/* Module filter chips */}
            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    onClick={() => setModule('')}
                    className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        module === '' ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:bg-accent',
                    )}
                >
                    {lang === 'th' ? 'ทั้งหมด' : 'All'}
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', module === '' ? 'bg-white/20' : 'bg-background')}>
                        {all.length}
                    </span>
                </button>
                {modules.map(([mod, count]) => (
                    <button
                        key={mod}
                        type="button"
                        onClick={() => setModule(mod)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                            module === mod ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:bg-accent',
                        )}
                    >
                        {mod}
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', module === mod ? 'bg-white/20' : 'bg-background')}>
                            {count}
                        </span>
                    </button>
                ))}
            </div>

            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(n) => n.key}
                loading={isLoading}
                rowHeight={58}
                onRowClick={setEditing}
                emptyState={
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                        <span className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
                            <Bell className="h-5 w-5" />
                        </span>
                        <div className="text-muted-foreground text-sm">{t('notification_empty')}</div>
                    </div>
                }
            />

            <NotificationEditDialog bell={editing} onClose={() => setEditing(null)} />
        </div>
    );
}
