import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/shared/status-badge';
import { TableSkeleton } from '@/components/shared/skeletons';
import { Field } from '@/components/shared/field';
import { useEmailTemplates, useEmailTemplateMutations } from '@/hooks/use-email-templates';
import { useSettings } from '@/hooks/use-settings';
import { settingsApi } from '@/services/settingsApi';
import { emailTemplateApi, type EmailTemplate } from '@/services/emailTemplateApi';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Check, Mail, MoreVertical, Plus, Search, Send, SquarePen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';

// Sample values used to render {{variables}} in the preview / test drawer.
const SAMPLE_VARS: Record<string, string> = {
    'user.first_name': 'Kanya',
    'user.email': 'kanya@inaba.co.th',
    count: '3',
    'stock.sku': 'SKU-1042',
    'stock.name': 'USB-C Docking Station',
    'stock.qty': '2',
    'ticket.id': 'TKT-2856',
    'ticket.subject': 'Printer not responding',
    'contract.vendor': 'Acme Co.',
    'contract.days_remaining': '30',
    'contract.days_overdue': '5',
    'reference.id': 'REF-0001',
    'employee.name': 'Somchai Suksawat',
    'employee.code': 'EMP-1042',
};

// Short notes for the "magic" placeholders that aren't a simple field — shown
// beside the variable chips in the Edit drawer so a short body doesn't look broken.
const VAR_NOTE: Record<string, { en: string; th: string }> = {
    items: { en: 'auto-generated list', th: 'ลิสต์อัตโนมัติ' },
    count: { en: 'number', th: 'จำนวน' },
};

function render(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([\w.]+)\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

function relativeTime(iso: string | null, lang: string, neverLabel: string): string {
    if (!iso) return neverLabel;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
    if (mins < 60) return lang === 'th' ? `${mins} นาทีที่แล้ว` : `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return lang === 'th' ? `${hrs} ชั่วโมงที่แล้ว` : `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const days = Math.round(hrs / 24);
    return lang === 'th' ? `${days} วันที่แล้ว` : `${days} day${days > 1 ? 's' : ''} ago`;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-muted')}
        >
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="h-2.5 w-2.5 text-brand" />}
            </span>
        </button>
    );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Mail }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-sm text-muted-foreground">{label}</div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
        </Card>
    );
}

export default function EmailTemplatesPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data, isLoading } = useEmailTemplates();
    const { update, test } = useEmailTemplateMutations();
    const [search, setSearch] = useState('');
    const [module, setModule] = useState('');
    const [editing, setEditing] = useState<EmailTemplate | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const templates = useMemo(() => data?.data ?? [], [data]);
    const stats = data?.stats;

    // Derive unique module prefixes from keys (e.g. "ticket" from "ticket.created")
    const modules = useMemo(() => {
        const counts: Record<string, number> = {};
        templates.forEach((tp) => {
            const mod = tp.key.split('.')[0];
            counts[mod] = (counts[mod] ?? 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    }, [templates]);

    const rows = useMemo(() => {
        let list = templates;
        if (module) list = list.filter((tp) => tp.key.startsWith(module + '.'));
        const q = search.trim().toLowerCase();
        if (q) list = list.filter((tp) => tp.name.toLowerCase().includes(q) || tp.key.toLowerCase().includes(q));
        return list;
    }, [templates, module, search]);

    const toggle = (tp: EmailTemplate) => update.mutate({ id: tp.id, payload: { enabled: !tp.enabled } });

    const sendPageTest = async () => {
        try {
            const res = await settingsApi.testMail();
            await Swal.fire({
                icon: res.sent ? 'success' : 'error',
                title: res.sent ? `${t('email_test_sent')} ${res.to ?? ''}` : t('email_test_failed'),
                confirmButtonColor: '#2563eb',
                customClass: { popup: '!rounded-xl', confirmButton: '!rounded-lg !font-medium' },
            });
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            await Swal.fire({ icon: 'error', title: msg ?? t('email_test_failed'), confirmButtonColor: '#2563eb' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('email_title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('email_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={sendPageTest}>
                        <Send className="h-4 w-4" />
                        {t('email_test')}
                    </Button>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('email_new')}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('email_templates')} value={stats?.templates ?? '—'} icon={Mail} />
                <StatCard label={t('email_enabled')} value={stats?.enabled ?? '—'} icon={Check} />
                <StatCard label={t('email_sent_today')} value={stats?.sent_today ?? '—'} icon={Send} />
                <StatCard label={t('email_delivery')} value={stats?.delivery_rate != null ? `${stats.delivery_rate}%` : '—'} icon={Mail} />
            </div>

            <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                    <div>
                        <div className="font-semibold">{t('email_templates')}</div>
                        <div className="text-xs text-muted-foreground">{t('email_templates_sub')}</div>
                    </div>
                    <div className="relative w-full max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('email_search')} className="pl-9" />
                    </div>
                </div>

                {/* Module filter tabs */}
                <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
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
                            {templates.length}
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

                {isLoading ? (
                    <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <th className="px-4 py-2.5">ID</th>
                                    <th className="px-4 py-2.5">{t('email_template')}</th>
                                    <th className="px-4 py-2.5">{t('email_trigger')}</th>
                                    <th className="px-4 py-2.5">{t('email_type')}</th>
                                    <th className="px-4 py-2.5">{t('email_last_sent')}</th>
                                    <th className="px-4 py-2.5">{t('email_enabled')}</th>
                                    <th className="px-4 py-2.5 text-right">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((tp) => (
                                    <tr key={tp.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{tp.code}</td>
                                        <td className="px-4 py-2.5 font-medium">{tp.name}</td>
                                        <td className="px-4 py-2.5">
                                            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{tp.key}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span
                                                className={cn(
                                                    'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                                                    tp.cadence === 'daily' ? 'bg-amber-500/12 text-amber-600' : 'bg-blue-500/12 text-blue-600',
                                                )}
                                            >
                                                {t(tp.cadence === 'daily' ? 'email_cadence_daily' : 'email_cadence_realtime')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                            {relativeTime(tp.last_sent_at, lang, t('email_never_sent'))}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Toggle on={tp.enabled} onClick={() => toggle(tp)} />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex justify-end">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button title={t('actions')} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setEditing(tp)}>
                                                            <SquarePen className="h-4 w-4" />
                                                            {t('email_edit_preview')}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => test.mutate(tp.id)}>
                                                            <Send className="h-4 w-4" />
                                                            {t('email_test')}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <EditorDrawer
                template={editing}
                onClose={() => setEditing(null)}
                onSave={(payload) => editing && update.mutate({ id: editing.id, payload }, { onSuccess: () => setEditing(null) })}
                saving={update.isPending}
                onTest={(id) => test.mutate(id)}
                testing={test.isPending}
            />
            <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}

/**
 * Combined editor: live preview on the left, edit form on the right. The preview
 * renders the unsaved content through the real email layout (debounced) so the two
 * panes always agree and match what recipients receive.
 */
function EditorDrawer({
    template,
    onClose,
    onSave,
    saving,
    onTest,
    testing,
}: {
    template: EmailTemplate | null;
    onClose: () => void;
    onSave: (p: { name: string; subject: string; body_html: string; enabled: boolean }) => void;
    saving: boolean;
    onTest: (id: number) => void;
    testing: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: settings } = useSettings();
    const brand = settings?.brand_name || 'Inaba IT';

    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [previewHtml, setPreviewHtml] = useState('');

    // Sync the form when a different template is opened.
    useEffect(() => {
        if (template) {
            setName(template.name);
            setSubject(template.subject);
            setBody(template.body_html);
            setEnabled(template.enabled);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template?.id]);

    // Debounced live preview through the real email layout (sample data + inert CTA).
    useEffect(() => {
        if (!template) return;
        const id = window.setTimeout(() => {
            emailTemplateApi.renderPreview({ name, subject, body_html: body }).then(setPreviewHtml).catch(() => {});
        }, 400);
        return () => window.clearTimeout(id);
    }, [template, name, subject, body]);

    const tokens = Array.from(new Set(Array.from(`${subject} ${body}`.matchAll(/\{\{([\w.]+)\}\}/g), (m) => m[1])));

    return (
        <Sheet open={!!template} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[1080px]">
                {template && (
                    <>
                        <SheetHeader className="border-border border-b px-6 py-4">
                            <SheetTitle>{template.name}</SheetTitle>
                            <SheetDescription className="font-mono text-xs">{template.key}</SheetDescription>
                        </SheetHeader>

                        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                            {/* Left — live preview */}
                            <div className="bg-muted/30 border-border flex min-h-0 flex-1 flex-col border-b lg:border-r lg:border-b-0">
                                <div className="border-border border-b px-5 py-3">
                                    <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{t('email_preview')}</div>
                                    <div className="mt-1 truncate text-sm font-semibold">[{brand}] {render(subject, SAMPLE_VARS)}</div>
                                </div>
                                <div className="flex-1 overflow-hidden p-4">
                                    <iframe title="email-preview" srcDoc={previewHtml} className="border-border h-full min-h-[560px] w-full rounded-lg border bg-white" />
                                </div>
                            </div>

                            {/* Right — edit form */}
                            <div className="flex w-full shrink-0 flex-col lg:w-[440px]">
                                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                                    <Field label={t('email_template')}>
                                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                                    </Field>
                                    <Field label={t('email_subject')}>
                                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                                    </Field>
                                    <Field label={t('email_body')}>
                                        <textarea
                                            value={body}
                                            onChange={(e) => setBody(e.target.value)}
                                            rows={10}
                                            className="focus:border-brand border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-xs outline-none"
                                        />
                                    </Field>

                                    {tokens.length > 0 && (
                                        <div>
                                            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('email_variables')}</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {tokens.map((tk) => (
                                                    <span key={tk} className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs">
                                                        {`{{${tk}}}`}
                                                        {VAR_NOTE[tk] && <span className="text-muted-foreground text-[10px]">· {VAR_NOTE[tk][lang]}</span>}
                                                    </span>
                                                ))}
                                            </div>
                                            <p className="text-muted-foreground mt-1.5 text-[11px]">{t('email_var_hint')}</p>
                                        </div>
                                    )}

                                    <label className="flex items-center gap-2 text-sm">
                                        <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} />
                                        {t('email_enabled')}
                                    </label>
                                </div>

                                <SheetFooter className="border-border flex-row gap-2 border-t p-4">
                                    <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
                                    <Button variant="outline" onClick={() => onTest(template.id)} disabled={testing}>
                                        <Send className="h-4 w-4" />
                                        {t('email_test')}
                                    </Button>
                                    <Button className="flex-1" onClick={() => onSave({ name, subject, body_html: body, enabled })} disabled={saving}>
                                        <Check className="h-4 w-4" />
                                        {t('email_save')}
                                    </Button>
                                </SheetFooter>
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const { create } = useEmailTemplateMutations();
    const [key, setKey] = useState('');
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('<p>Hi {{user.first_name}},</p>\n<p></p>');
    const [error, setError] = useState('');

    const reset = () => { setKey(''); setName(''); setSubject(''); setBody('<p>Hi {{user.first_name}},</p>\n<p></p>'); setError(''); };

    const submit = async () => {
        setError('');
        if (!key.trim() || !name.trim() || !subject.trim()) { setError(t('emp_err_first')); return; }
        try {
            await create.mutateAsync({ key: key.trim(), name: name.trim(), subject: subject.trim(), body_html: body, enabled: true });
            reset();
            onClose();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(msg ?? t('cred_err_generic'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('email_create')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-1">
                    <Field label={t('email_key')}>
                        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ticket.escalated" className="font-mono" />
                    </Field>
                    <Field label={t('email_template')}>
                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <Field label={t('email_subject')}>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </Field>
                    <Field label={t('email_body')}>
                        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-brand" />
                    </Field>
                    {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => { reset(); onClose(); }}>{t('cancel')}</Button>
                    <Button onClick={submit} disabled={create.isPending}>
                        <Plus className="h-4 w-4" />
                        {t('email_create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
