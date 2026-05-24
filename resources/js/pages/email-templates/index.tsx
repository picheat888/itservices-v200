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
import type { EmailTemplate } from '@/services/emailTemplateApi';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Check, Eye, Mail, Plus, Search, Send, SquarePen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';

// Sample values used to render {{variables}} in the preview / test drawer.
const SAMPLE_VARS: Record<string, string> = {
    'user.first_name': 'Kanya',
    'user.email': 'kanya@inaba.co.th',
    'ticket.id': 'TKT-2856',
    'ticket.subject': 'Printer not responding',
    'contract.vendor': 'Acme Co.',
    'reference.id': 'REF-0001',
    'employee.name': 'Somchai Suksawat',
    'employee.code': 'EMP-1042',
};

const AVAILABLE_VARS = [
    '{{user.first_name}}', '{{user.email}}', '{{ticket.id}}', '{{ticket.subject}}', '{{contract.vendor}}', '{{reference.id}}',
];

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
    const [preview, setPreview] = useState<EmailTemplate | null>(null);
    const [edit, setEdit] = useState<EmailTemplate | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const templates = data?.data ?? [];
    const stats = data?.stats;

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return templates;
        return templates.filter((tp) => tp.name.toLowerCase().includes(q) || tp.key.toLowerCase().includes(q));
    }, [templates, search]);

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
                                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                            {relativeTime(tp.last_sent_at, lang, t('email_never_sent'))}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Toggle on={tp.enabled} onClick={() => toggle(tp)} />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => setPreview(tp)} title={t('email_preview')} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                                <button onClick={() => setEdit(tp)} title={t('edit')} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
                                                    <SquarePen className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <PreviewDrawer template={preview} onClose={() => setPreview(null)} onTest={(id) => test.mutate(id)} testing={test.isPending} />
            <EditDrawer
                template={edit}
                onClose={() => setEdit(null)}
                onSave={(payload) => edit && update.mutate({ id: edit.id, payload }, { onSuccess: () => setEdit(null) })}
                saving={update.isPending}
            />
            <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}

function PreviewDrawer({ template, onClose, onTest, testing }: { template: EmailTemplate | null; onClose: () => void; onTest: (id: number) => void; testing: boolean }) {
    const t = useT();
    const { data: settings } = useSettings();
    const brand = settings?.brand_name || 'Inaba IT';

    return (
        <Sheet open={!!template} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-[620px] sm:max-w-[620px]">
                {template && (
                    <>
                        <SheetHeader>
                            <SheetTitle>{template.name}</SheetTitle>
                            <SheetDescription>{t('email_trigger')}: {template.key}</SheetDescription>
                        </SheetHeader>

                        <div className="mt-6 space-y-4">
                            <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
                                <div className="flex gap-6 border-b border-border px-4 py-3 text-xs">
                                    <div><span className="text-muted-foreground">From: </span><span className="font-mono">noreply@example.com</span></div>
                                    <div><span className="text-muted-foreground">To: </span><span className="font-mono">{'{{user.email}}'}</span></div>
                                </div>
                                <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                                    [{brand}] {render(template.subject, SAMPLE_VARS)}
                                </div>
                                <div
                                    className="bg-background px-5 py-5 text-sm leading-relaxed [&_p]:mb-3"
                                    dangerouslySetInnerHTML={{ __html: render(template.body_html, SAMPLE_VARS) }}
                                />
                            </div>

                            <div>
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('email_variables')}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {AVAILABLE_VARS.map((v) => (
                                        <span key={v} className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{v}</span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <SheetFooter className="mt-6 flex-row gap-2">
                            <Button variant="outline" className="flex-1" onClick={onClose}>{t('cancel')}</Button>
                            <Button className="flex-1" onClick={() => onTest(template.id)} disabled={testing}>
                                <Send className="h-4 w-4" />
                                {t('email_test')}
                            </Button>
                        </SheetFooter>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function EditDrawer({ template, onClose, onSave, saving }: { template: EmailTemplate | null; onClose: () => void; onSave: (p: { name: string; subject: string; body_html: string; enabled: boolean }) => void; saving: boolean }) {
    const t = useT();
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [enabled, setEnabled] = useState(true);

    // Sync local form when a different template is opened.
    useEffect(() => {
        if (template) {
            setName(template.name);
            setSubject(template.subject);
            setBody(template.body_html);
            setEnabled(template.enabled);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template?.id]);

    return (
        <Sheet open={!!template} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[620px] flex-col sm:max-w-[620px]">
                {template && (
                    <>
                        <SheetHeader>
                            <SheetTitle>{t('edit')}: {template.name}</SheetTitle>
                            <SheetDescription>{template.key}</SheetDescription>
                        </SheetHeader>

                        <div className="mt-6 flex-1 space-y-4 overflow-y-auto px-1">
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
                                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-brand"
                                />
                            </Field>
                            <label className="flex items-center gap-2 text-sm">
                                <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} />
                                {t('email_enabled')}
                            </label>
                        </div>

                        <SheetFooter className="flex-row gap-2">
                            <Button variant="outline" className="flex-1" onClick={onClose}>{t('cancel')}</Button>
                            <Button className="flex-1" onClick={() => onSave({ name, subject, body_html: body, enabled })} disabled={saving}>
                                <Check className="h-4 w-4" />
                                {t('email_save')}
                            </Button>
                        </SheetFooter>
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
