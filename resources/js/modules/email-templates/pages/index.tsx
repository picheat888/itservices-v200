import { Field } from '@/shared/components/field';
import { TableSkeleton } from '@/shared/components/skeletons';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useEmailTemplateMutations, useEmailTemplates } from '@/modules/email-templates/hooks/use-email-templates';
import { settingsApi, useSettings } from '@/modules/settings';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { emailTemplateApi, type EmailTemplate } from '@/modules/email-templates/api/emailTemplateApi';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import {
    Bold,
    Check,
    CornerDownLeft,
    Eye,
    Italic,
    Link2,
    List,
    Loader2,
    Mail,
    MoreVertical,
    PenLine,
    Pilcrow,
    Plus,
    RotateCcw,
    Save,
    Search,
    Send,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Sample values used to render {{variables}} in the preview / test drawer.
const SAMPLE_VARS: Record<string, string> = {
    'user.first_name': 'Thanapon',
    'user.email': 'thanapon@abcd.co.th',
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

// localStorage key for the page's remembered list filters (search + module tab).
const FILTER_KEY = 'email-templates.filters';

function render(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([\w.]+)\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

// Escapes text so it renders literally inside the highlight overlay (which uses
// innerHTML); only our own <span> wrappers are real markup.
function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Colour-codes HTML for the editor overlays: {{variables}} in violet, HTML tags
 * in sky-blue, everything else as plain text. All user content is HTML-escaped —
 * the returned string is safe to inject (only our own <span> wrappers are markup).
 */
function highlightHtml(src: string): string {
    const re = /(<\/?[a-zA-Z][^>]*>)|(\{\{[\w.]+\}\})/g;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
        out += escapeHtml(src.slice(last, m.index));
        if (m[1]) {
            out += `<span class="text-sky-600 dark:text-sky-400">${escapeHtml(m[1])}</span>`;
        } else {
            // No bold/padding — anything that changes glyph width would drift the caret
            // (which is laid out by the textarea, not this overlay) out of alignment.
            out += `<span class="rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">${escapeHtml(m[2])}</span>`;
        }
        last = re.lastIndex;
    }
    out += escapeHtml(src.slice(last));
    return out;
}

// Body overlay needs a trailing newline so its height tracks the textarea's.
function highlightBody(src: string): string {
    return highlightHtml(src) + '\n';
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

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-brand' : 'bg-muted')}
        >
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="text-brand h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

// Single quick-tool button in the Body editor toolbar (icon + tooltip).
function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-7 w-7 items-center justify-center rounded transition-colors"
        >
            {children}
        </button>
    );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Mail }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
        </Card>
    );
}

export default function EmailTemplatesPage() {
    const t = useT();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { data, isLoading } = useEmailTemplates();
    const { update, test, reset, resetAll } = useEmailTemplateMutations();
    // Restore the last-used filters so a reload lands on the same view.
    const savedFilters = useMemo<{ search?: string; module?: string }>(() => {
        try {
            return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}');
        } catch {
            return {};
        }
    }, []);
    const [search, setSearch] = useState(savedFilters.search ?? '');
    const [module, setModule] = useState(savedFilters.module ?? '');
    const [editing, setEditing] = useState<EmailTemplate | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [pageTesting, setPageTesting] = useState(false);

    // Remember search + module across reloads.
    useEffect(() => {
        localStorage.setItem(FILTER_KEY, JSON.stringify({ search, module }));
    }, [search, module]);

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

    // Whether any standard template currently differs from its standard (drives the
    // visibility of the page-level "Reset all" button).
    const anyModified = useMemo(() => templates.some((tp) => tp.is_modified), [templates]);

    // Reset every standard template back to its standard content (after confirming).
    const resetAllToStandard = async () => {
        await confirm({
            variant: 'warn',
            title: t('email_reset_all_title'),
            description: t('email_reset_all_text'),
            confirmText: t('email_reset_confirm'),
            action: () => resetAll.mutateAsync(),
        });
    };

    const sendPageTest = async () => {
        setPageTesting(true);
        try {
            const res = await settingsApi.testMail();
            useToastStore.getState().push(res.sent ? `${t('email_test_sent')} ${res.to ?? ''}` : t('email_test_failed'), res.sent ? 'info' : 'error');
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            useToastStore.getState().push(msg ?? t('email_test_failed'), 'error');
        } finally {
            setPageTesting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('email_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('email_sub')}</p>
                </div>
                <div className="flex gap-2">
                    {anyModified && (
                        <Button variant="outline" onClick={resetAllToStandard} disabled={resetAll.isPending} title={t('email_reset_all')}>
                            {resetAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                            {t('email_reset_all')}
                        </Button>
                    )}
                    <Button variant="outline" onClick={sendPageTest} disabled={pageTesting}>
                        {pageTesting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('email_test')}
                    </Button>
                    <Button onClick={() => setCreateOpen(true)}>{t('email_new')}</Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('email_templates')} value={stats?.templates ?? '—'} icon={Mail} />
                <StatCard label={t('email_enabled')} value={stats?.enabled ?? '—'} icon={Check} />
                <StatCard label={t('email_sent_today')} value={stats?.sent_today ?? '—'} icon={Send} />
                <StatCard label={t('email_delivery')} value={stats?.delivery_rate != null ? `${stats.delivery_rate}%` : '—'} icon={Mail} />
            </div>

            <Card className="overflow-hidden">
                <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                        <div className="font-semibold">{t('email_templates')}</div>
                        <div className="text-muted-foreground text-xs">{t('email_templates_sub')}</div>
                    </div>
                    <div className="relative w-full max-w-xs">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('email_search')} className="pl-9" />
                    </div>
                </div>

                {/* Module filter tabs */}
                <div className="border-border flex flex-wrap gap-1.5 border-b px-4 py-2.5">
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
                            <span
                                className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', module === mod ? 'bg-white/20' : 'bg-background')}
                            >
                                {count}
                            </span>
                        </button>
                    ))}
                </div>

                {isLoading ? (
                    <div className="p-4">
                        <TableSkeleton rows={8} cols={6} />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                        <span className="bg-muted text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full">
                            <Mail className="h-6 w-6" />
                        </span>
                        <div className="font-medium">{t('email_empty_title')}</div>
                        <div className="text-muted-foreground text-sm">{search || module ? t('email_empty_filtered') : t('email_empty')}</div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
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
                                    <tr key={tp.id} className="border-border/60 hover:bg-accent/40 border-b last:border-0">
                                        <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tp.code}</td>
                                        <td className="px-4 py-2.5 font-medium">
                                            <span className="flex items-center gap-2">
                                                {tp.name}
                                                {tp.is_modified && (
                                                    <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                                        {t('email_modified')}
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{tp.key}</span>
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
                                        <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">
                                            {relativeTime(tp.last_sent_at, lang, t('email_never_sent'))}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Toggle on={tp.enabled} onClick={() => toggle(tp)} />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => setEditing(tp)}
                                                    title={t('email_edit_preview')}
                                                    className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
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

            <EditorDialog
                template={editing}
                onClose={() => setEditing(null)}
                onSave={(payload) => (editing ? update.mutateAsync({ id: editing.id, payload }) : Promise.resolve())}
                saving={update.isPending}
                onTest={(id) => test.mutateAsync(id)}
                testing={test.isPending}
                onReset={(id) => reset.mutateAsync(id)}
                resetting={reset.isPending}
            />
            <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}

// Debounced render of the unsaved content through the real email layout, so the
// preview matches what recipients get. Disabled (skipped) when `enabled` is false.
function useLivePreview(enabled: boolean, name: string, subject: string, body: string) {
    const [previewHtml, setPreviewHtml] = useState('');
    const [rendering, setRendering] = useState(false);
    useEffect(() => {
        if (!enabled) return;
        setRendering(true);
        const id = window.setTimeout(() => {
            emailTemplateApi
                .renderPreview({ name, subject, body_html: body })
                .then(setPreviewHtml)
                .catch(() => {})
                .finally(() => setRendering(false));
        }, 400);
        return () => window.clearTimeout(id);
    }, [enabled, name, subject, body]);
    return { previewHtml, rendering, setPreviewHtml };
}

// Single-line subject input with {{variable}} / tag highlighting (transparent input
// over an escaped colour layer; horizontal scroll synced).
function SubjectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const hlRef = useRef<HTMLDivElement>(null);
    return (
        <div className="border-input bg-background ring-offset-background focus-within:ring-ring relative h-10 rounded-md border focus-within:ring-2 focus-within:ring-offset-2">
            <div
                ref={hlRef}
                aria-hidden="true"
                className="text-foreground pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 text-base whitespace-pre md:text-sm"
                dangerouslySetInnerHTML={{ __html: highlightHtml(value) }}
            />
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={(e) => {
                    const h = hlRef.current;
                    if (h) h.scrollLeft = e.currentTarget.scrollLeft;
                }}
                spellCheck={false}
                className="caret-foreground absolute inset-0 h-full w-full bg-transparent px-3 text-base text-transparent outline-none md:text-sm"
            />
        </div>
    );
}

/**
 * Body HTML editor: a quick-tools toolbar + syntax-highlighted textarea + clickable
 * variable chips. Tools insert HTML at the caret or wrap the selection. `extraText`
 * (e.g. the subject) folds its variables into the chip list too.
 */
function BodyEditor({ value, onChange, extraText = '' }: { value: string; onChange: (v: string) => void; extraText?: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const ref = useRef<HTMLTextAreaElement>(null);
    const hlRef = useRef<HTMLDivElement>(null);

    const editBody = (build: (selected: string) => { text: string; selStart: number; selEnd: number }) => {
        const el = ref.current;
        const start = el ? el.selectionStart : value.length;
        const end = el ? el.selectionEnd : value.length;
        const { text, selStart, selEnd } = build(value.slice(start, end));
        onChange(value.slice(0, start) + text + value.slice(end));
        const a = start + selStart;
        const b = start + selEnd;
        requestAnimationFrame(() => {
            const node = ref.current;
            if (node) {
                node.focus();
                node.setSelectionRange(a, b);
            }
        });
    };
    const wrap = (before: string, after: string) =>
        editBody((sel) => ({ text: before + sel + after, selStart: before.length, selEnd: before.length + sel.length }));
    const insert = (text: string) => editBody(() => ({ text, selStart: text.length, selEnd: text.length }));
    const insertVar = (key: string) => insert(`{{${key}}}`);
    const insertLink = () =>
        editBody((sel) => {
            const text = `<a href="">${sel || 'link text'}</a>`;
            return { text, selStart: 9, selEnd: 9 };
        });
    const insertList = () =>
        editBody((sel) => {
            const lines = sel ? sel.split('\n').filter((l) => l.trim() !== '') : [''];
            const text = `<ul>\n${lines.map((l) => `  <li>${l}</li>`).join('\n')}\n</ul>`;
            const pos = text.indexOf('</li>');
            return { text, selStart: pos, selEnd: pos };
        });

    const tokens = Array.from(new Set(Array.from(`${extraText} ${value}`.matchAll(/\{\{([\w.]+)\}\}/g), (m) => m[1])));

    return (
        <>
            <div className="border-input bg-background focus-within:border-brand overflow-hidden rounded-md border">
                {/* Quick tools — insert HTML at the caret / around the selection */}
                <div className="border-border bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
                    <ToolBtn title="Bold" onClick={() => wrap('<strong>', '</strong>')}>
                        <Bold className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn title="Italic" onClick={() => wrap('<em>', '</em>')}>
                        <Italic className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <span className="bg-border mx-1 h-4 w-px" />
                    <ToolBtn title="Line break (<br>)" onClick={() => insert('<br>\n')}>
                        <CornerDownLeft className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn title="Paragraph (<p>)" onClick={() => wrap('<p>', '</p>')}>
                        <Pilcrow className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <ToolBtn title="Bullet list" onClick={insertList}>
                        <List className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <span className="bg-border mx-1 h-4 w-px" />
                    <ToolBtn title="Link" onClick={insertLink}>
                        <Link2 className="h-3.5 w-3.5" />
                    </ToolBtn>
                    <select
                        value=""
                        onChange={(e) => {
                            if (e.target.value) insertVar(e.target.value);
                            e.currentTarget.value = '';
                        }}
                        title={t('email_insert_var')}
                        className="text-muted-foreground hover:text-foreground ml-auto h-7 cursor-pointer rounded bg-transparent px-1.5 text-xs outline-none"
                    >
                        <option value="">{`{{ }} ${t('email_insert_var')}`}</option>
                        {Object.keys(SAMPLE_VARS).map((k) => (
                            <option key={k} value={k}>{`{{${k}}}`}</option>
                        ))}
                    </select>
                </div>
                {/* Syntax highlight: a coloured layer under a transparent, scroll-synced textarea. */}
                <div className="relative">
                    <div
                        ref={hlRef}
                        aria-hidden="true"
                        className="text-foreground pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: highlightBody(value) }}
                    />
                    <textarea
                        ref={ref}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onScroll={(e) => {
                            const h = hlRef.current;
                            if (h) {
                                h.scrollTop = e.currentTarget.scrollTop;
                                h.scrollLeft = e.currentTarget.scrollLeft;
                            }
                        }}
                        spellCheck={false}
                        rows={12}
                        className="caret-foreground relative block w-full resize-y bg-transparent px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap text-transparent outline-none"
                    />
                </div>
            </div>

            {tokens.length > 0 && (
                <div className="mt-3">
                    <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('email_variables')}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {tokens.map((tk) => (
                            <button
                                key={tk}
                                type="button"
                                onClick={() => insertVar(tk)}
                                title={t('email_insert_var')}
                                className="bg-muted hover:bg-accent inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs transition-colors"
                            >
                                {`{{${tk}}}`}
                                {VAR_NOTE[tk] && <span className="text-muted-foreground text-[10px]">· {VAR_NOTE[tk][lang]}</span>}
                            </button>
                        ))}
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-[11px]">{t('email_var_hint')}</p>
                </div>
            )}
        </>
    );
}

// Live email preview framed like an inbox message (from/to/subject + rendered body).
function PreviewPane({ brand, subject, previewHtml }: { brand: string; subject: string; previewHtml: string }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="bg-muted/30 border-border flex min-h-0 flex-col border-r">
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="border-border mx-auto flex h-full max-w-[640px] flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
                    <div className="border-border bg-muted/40 flex flex-wrap gap-x-6 gap-y-1 border-b px-4 py-2.5 text-[11px]">
                        <div>
                            <span className="text-muted-foreground">{lang === 'th' ? 'จาก ' : 'From '}</span>
                            <span className="font-mono">no-reply@{(brand || 'abcd').toLowerCase().replace(/\s+/g, '')}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{lang === 'th' ? 'ถึง ' : 'To '}</span>
                            <span className="font-mono">{'{{user.email}}'}</span>
                        </div>
                        <div className="text-foreground w-full truncate font-semibold">
                            [{brand}] {render(subject, SAMPLE_VARS)}
                        </div>
                    </div>
                    {previewHtml ? (
                        <iframe title="email-preview" srcDoc={previewHtml} className="block w-full flex-1 border-0 bg-white" />
                    ) : (
                        <div className="space-y-3 p-6">
                            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
                            <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
                            <div className="bg-muted h-28 w-full animate-pulse rounded" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Preview | Edit column-header strip shared by both dialogs.
function PaneHeaders({ rendering }: { rendering: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    return (
        <div className="border-border text-muted-foreground grid grid-cols-2 border-b text-[11px] font-semibold tracking-wide uppercase">
            <div className="border-border flex items-center justify-between border-r px-5 py-2.5">
                <span className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    {t('email_preview')}
                </span>
                {rendering && (
                    <span className="flex items-center gap-1 text-[10px] normal-case">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {lang === 'th' ? 'กำลังอัปเดต' : 'updating'}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-1.5 px-5 py-2.5">
                <PenLine className="h-3.5 w-3.5" />
                {t('edit')}
            </div>
        </div>
    );
}

/**
 * Combined editor as a centered dialog (~75% of the viewport, rounded): a title
 * bar, a sub-header with the template name + enable toggle, then a split body with
 * the live preview on the left and the edit form on the right. The preview renders
 * the unsaved content through the real email layout (debounced) so the two panes
 * always agree and match what recipients receive.
 */
function EditorDialog({
    template,
    onClose,
    onSave,
    saving,
    onTest,
    testing,
    onReset,
    resetting,
}: {
    template: EmailTemplate | null;
    onClose: () => void;
    onSave: (p: { name: string; subject: string; body_html: string; enabled: boolean }) => Promise<unknown>;
    saving: boolean;
    onTest: (id: number) => Promise<unknown>;
    testing: boolean;
    onReset: (id: number) => Promise<unknown>;
    resetting: boolean;
}) {
    const t = useT();
    const confirm = useConfirm();
    const { data: settings } = useSettings();
    const brand = settings?.brand_name || 'ABCD IT';

    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [enabled, setEnabled] = useState(true);
    // Saved/sent values to diff against (the Save button is disabled until something
    // changes) plus short-lived success flags for the button check marks.
    const [base, setBase] = useState({ name: '', subject: '', body: '', enabled: true });
    const [savedOk, setSavedOk] = useState(false);
    const [sentOk, setSentOk] = useState(false);
    const [resetOk, setResetOk] = useState(false);

    const { previewHtml, rendering, setPreviewHtml } = useLivePreview(!!template, name, subject, body);

    // Sync the form when a different template is opened (and clear the stale preview).
    useEffect(() => {
        if (template) {
            setName(template.name);
            setSubject(template.subject);
            setBody(template.body_html);
            setEnabled(template.enabled);
            setBase({ name: template.name, subject: template.subject, body: template.body_html, enabled: template.enabled });
            setPreviewHtml('');
            setSavedOk(false);
            setSentOk(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template?.id]);

    const dirty = name !== base.name || subject !== base.subject || body !== base.body || enabled !== base.enabled;

    // Save: persist, flash a check, and reset the dirty baseline so the button greys out again.
    const handleSave = async () => {
        if (!template || !dirty || saving) return;
        try {
            await onSave({ name, subject, body_html: body, enabled });
            setBase({ name, subject, body, enabled });
            setSavedOk(true);
            window.setTimeout(() => setSavedOk(false), 1600);
        } catch {
            useToastStore.getState().push(t('cred_err_generic'), 'error');
        }
    };

    // Send test: fire the synchronous test send, flash a check on success.
    const handleTest = async () => {
        if (!template || testing) return;
        try {
            await onTest(template.id);
            setSentOk(true);
            window.setTimeout(() => setSentOk(false), 1600);
        } catch {
            useToastStore.getState().push(t('email_test_failed'), 'error');
        }
    };

    // Reset this template to its standard content (after confirming). The API returns
    // the refreshed row, so sync the form + baseline to it without reopening the dialog.
    const handleReset = async () => {
        if (!template || resetting) return;
        await confirm({
            variant: 'warn',
            title: t('email_reset_title'),
            description: t('email_reset_text'),
            confirmText: t('email_reset_confirm'),
            action: async () => {
                const res = (await onReset(template.id)) as { data?: EmailTemplate } | undefined;
                const next = res?.data;
                if (next) {
                    setName(next.name);
                    setSubject(next.subject);
                    setBody(next.body_html);
                    setEnabled(next.enabled);
                    setBase({ name: next.name, subject: next.subject, body: next.body_html, enabled: next.enabled });
                    setPreviewHtml('');
                }
                setResetOk(true);
                window.setTimeout(() => setResetOk(false), 1600);
            },
        });
    };

    // Confirm before discarding unsaved edits (X / Esc / click-outside / Cancel).
    const requestClose = async () => {
        if (dirty) {
            if (
                !(await confirm({
                    variant: 'warn',
                    title: t('email_discard_title'),
                    description: t('email_discard_text'),
                    confirmText: t('email_discard_confirm'),
                }))
            )
                return;
        }
        onClose();
    };

    // Ctrl/⌘+S saves without leaving the editor.
    useEffect(() => {
        if (!template) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template, dirty, saving, name, subject, body, enabled]);

    return (
        <Dialog open={!!template} onOpenChange={(o) => !o && requestClose()}>
            <DialogContent
                aria-describedby={undefined}
                onEscapeKeyDown={(e) => {
                    e.preventDefault();
                    requestClose();
                }}
                onInteractOutside={(e) => {
                    e.preventDefault();
                    requestClose();
                }}
                className="flex h-[85vh] w-[75vw] max-w-[75vw] flex-col gap-0 overflow-hidden rounded-2xl p-0"
            >
                {template && (
                    <>
                        {/* Row 1 — title (the close X is rendered by DialogContent) */}
                        <DialogHeader className="border-border space-y-0 border-b px-6 py-3.5 pr-14 text-left">
                            <DialogTitle className="text-base">{t('email_edit_preview')}</DialogTitle>
                        </DialogHeader>

                        {/* Row 2 — template name + cadence (key on its own line) + enable toggle */}
                        <div className="border-border flex items-center justify-between gap-3 border-b px-6 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2.5">
                                    <span className="truncate font-semibold">{name || template.name}</span>
                                    <span
                                        className={cn(
                                            'shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-semibold',
                                            template.cadence === 'daily' ? 'bg-amber-500/12 text-amber-600' : 'bg-blue-500/12 text-blue-600',
                                        )}
                                    >
                                        {t(template.cadence === 'daily' ? 'email_cadence_daily' : 'email_cadence_realtime')}
                                    </span>
                                </div>
                                <div className="text-muted-foreground truncate font-mono text-xs">{template.key}</div>
                            </div>
                            <label className="flex shrink-0 items-center gap-2 text-sm">
                                <span className="text-muted-foreground">{t('email_enabled')}</span>
                                <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} />
                            </label>
                        </div>

                        <PaneHeaders rendering={rendering} />

                        {/* Body — two columns */}
                        <div className="grid min-h-0 flex-1 grid-cols-2">
                            <PreviewPane brand={brand} subject={subject} previewHtml={previewHtml} />

                            {/* Right — edit form */}
                            <div className="flex min-h-0 flex-col">
                                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                                    <Field label={t('email_template')}>
                                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                                    </Field>
                                    <Field label={t('email_subject')}>
                                        <SubjectField value={subject} onChange={setSubject} />
                                    </Field>
                                    <Field label={t('email_body')}>
                                        <BodyEditor value={body} onChange={setBody} extraText={subject} />
                                    </Field>
                                </div>
                            </div>
                        </div>

                        {/* Footer — Send Test (left) · Cancel / Save (right) */}
                        <div className="border-border flex items-center justify-between gap-2 border-t px-6 py-3">
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleTest} disabled={testing} title={t('email_test_hint')}>
                                    {testing ? <Loader2 className="animate-spin" /> : sentOk ? <Check /> : <Send />}
                                    {sentOk ? t('email_sent') : t('email_test')}
                                </Button>
                                {template.is_standard && (
                                    <Button variant="outline" onClick={handleReset} disabled={resetting} title={t('email_reset_hint')}>
                                        {resetting ? <Loader2 className="animate-spin" /> : resetOk ? <Check /> : <RotateCcw />}
                                        {resetOk ? t('email_reset_done') : t('email_reset')}
                                    </Button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={requestClose}>
                                    {t('cancel')}
                                </Button>
                                <Button onClick={handleSave} disabled={!dirty || saving}>
                                    {saving ? <Loader2 className="animate-spin" /> : savedOk ? <Check /> : <Save />}
                                    {savedOk ? t('email_saved') : t('email_save')}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
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
    const { data: settings } = useSettings();
    const brand = settings?.brand_name || 'ABCD IT';
    const { previewHtml, rendering } = useLivePreview(open, name, subject, body);

    const reset = () => {
        setKey('');
        setName('');
        setSubject('');
        setBody('<p>Hi {{user.first_name}},</p>\n<p></p>');
        setError('');
    };

    const submit = async () => {
        setError('');
        if (!key.trim() || !name.trim() || !subject.trim()) {
            setError(t('emp_err_first'));
            return;
        }
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
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) {
                    reset();
                    onClose();
                }
            }}
        >
            <DialogContent
                aria-describedby={undefined}
                className="flex h-[85vh] w-[75vw] max-w-[75vw] flex-col gap-0 overflow-hidden rounded-2xl p-0"
            >
                <DialogHeader className="border-border space-y-0 border-b px-6 py-3.5 pr-14 text-left">
                    <DialogTitle className="text-base">{t('email_create')}</DialogTitle>
                </DialogHeader>

                <PaneHeaders rendering={rendering} />

                {/* Body — live preview (left) · new-template form (right) */}
                <div className="grid min-h-0 flex-1 grid-cols-2">
                    <PreviewPane brand={brand} subject={subject} previewHtml={previewHtml} />

                    <div className="flex min-h-0 flex-col">
                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                            <Field label={t('email_key')}>
                                <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ticket.escalated" className="font-mono" />
                            </Field>
                            <Field label={t('email_template')}>
                                <Input value={name} onChange={(e) => setName(e.target.value)} />
                            </Field>
                            <Field label={t('email_subject')}>
                                <SubjectField value={subject} onChange={setSubject} />
                            </Field>
                            <Field label={t('email_body')}>
                                <BodyEditor value={body} onChange={setBody} extraText={subject} />
                            </Field>
                            {error && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{error}</div>}
                        </div>
                    </div>
                </div>

                <div className="border-border flex items-center justify-end gap-2 border-t px-6 py-3">
                    <Button
                        variant="outline"
                        onClick={() => {
                            reset();
                            onClose();
                        }}
                    >
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={create.isPending}>
                        {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                        {t('email_create')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
