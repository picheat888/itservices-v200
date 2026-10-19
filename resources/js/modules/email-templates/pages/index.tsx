import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { emailTemplateApi, type EmailLogRow, type EmailLogStatus, type EmailTemplate } from '@/modules/email-templates/api/emailTemplateApi';
import { useEmailLog, useEmailLogs, useEmailTemplateMutations, useEmailTemplates } from '@/modules/email-templates/hooks/use-email-templates';
import { findHtmlIssues, htmlIssueMessage, type HtmlIssue } from '@/modules/email-templates/lib/html-issues';
import { NotificationSettingsPane, NotificationSettingsStats } from '@/modules/notification';
import { useSettings } from '@/modules/settings';
import { DataTable, type Column } from '@/shared/components/data-table';
import { DateTimeCell } from '@/shared/components/date-time-cell';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DisabledReason } from '@/shared/components/disabled-reason';
import { EmptyState } from '@/shared/components/empty-state';
import { Field, FormErrorBanner, type FieldControlProps } from '@/shared/components/field';
import { LoadFailed } from '@/shared/components/load-failed';
import { PageTabs } from '@/shared/components/page-tabs';
import { RecordStamps } from '@/shared/components/record-stamps';
import { SaveButton } from '@/shared/components/save-button';
import { SectionLabel } from '@/shared/components/section-label';
import { StatCard } from '@/shared/components/stat-card';
import { StatusBadge } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { useDateColumnWidth } from '@/shared/hooks/use-date-column-width';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDialogParam } from '@/shared/hooks/use-dialog-param';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useRecordView } from '@/shared/hooks/use-record-view';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { bindDateFormat, relativeTime, type DateFormatter } from '@/shared/lib/datetime';
import { formatNumber } from '@/shared/lib/number';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn, toRecordId } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm, useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import {
    AlertTriangle,
    Bold,
    Check,
    ChevronUp,
    CornerDownLeft,
    Eye,
    History,
    Italic,
    Link2,
    List,
    Loader2,
    Mail,
    PenLine,
    Pilcrow,
    RotateCcw,
    Search,
    Send,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

// Sample values for {{variables}} in the preview; mirrors EmailTemplateController::sampleVars().
const SAMPLE_VARS: Record<string, string> = {
    'user.first_name': 'Thanapon',
    'user.email': 'thanapon@abcd.co.th',
    count: '3',
    'report.name': 'ทะเบียนทรัพย์สิน',
    'report.period': '2026-09-21|2026-09-27',
    'report.rows': '1,248',
    'report.frequency': 'Every Monday at 07:00',
    'report.owner': 'Thanapon',
    'report.attachment_note': 'The report file is attached.',
    'report.format': 'Excel',
    'report.file': 'Report_assets-overview_2026-10-18.xlsx',
    'report.expires': '17 Nov 2026',
    'stock.sku': 'SKU-1042',
    'stock.name': 'USB-C Docking Station',
    'stock.qty': '2',
    'stock.min': '5',
    'stock.max': '40',
    'stock.request_no': 'REQ-2026-0001',
    'stock.request_by': 'Piches Srisuk',
    'stock.request_reason': 'Replacing the dock on the 3rd floor meeting room.',
    'stock.request_date': '2026-08-18',
    'stock.approver': 'Anong Wattana',
    'stock.fulfilled_by': 'Kankanok P',
    'stock.fulfilled_date': '2026-08-20',
    'asset.code': 'INK-IT-26-0042',
    'asset.model': 'ThinkCentre Neo 55a 24 G6',
    'asset.tag': 'PC042',
    'asset.type': 'Computer',
    'asset.from': 'Store IT',
    'asset.holder': 'Somchai Suksawat',
    'asset.count': '3',
    'employee.last_working': '2026-12-31',
    'ticket.id': 'TKT-2856',
    'ticket.subject': 'Printer not responding',
    'ticket.category': 'Hardware',
    'ticket.details': 'The printer on the 3rd floor shows a paper jam error.',
    'ticket.resolution': 'Replaced the fuser roller and cleared the jam sensor.',
    'ticket.update': 'The replacement fuser roller is on order, expected within three working days.',
    'ticket.requester': 'Somchai Suksawat',
    'ticket.assignee': 'Piches Srisuk',
    'from.name': 'Anong Wattana',
    'contract.vendor': 'Acme Co.',
    'contract.name': 'Annual support',
    'contract.code': 'CT-2026-014',
    'contract.days_remaining': '30',
    'contract.days_overdue': '5',
    'contract.end_date': '2026-12-31',
    'contract.details': 'Microsoft 365 E3 License Agreement, 320 seats',
    'reference.id': 'REF-0001',
    'request.title': 'Request: Mail group',
    'request.type': 'Email group',
    'request.date': '2026-08-18',
    'request.approved_date': '2026-08-20',
    'request.rejected_date': '2026-08-20',
    'request.cancelled_date': '2026-08-22',
    'request.ticket_no': 'TKT-2856',
    'request.completed_date': '2026-08-22',
    'request.completed_by': 'Kankanok P',
    'request.reason': 'Onboarding request with the new employee, first day 01-09-2026.',
    'request.details': 'Device type: Desktop PC',
    'approver.name': 'Anong Wattana',
    'approver.position': 'Manager',
    'approver.department': 'Information Technology',
    'requester.name': 'Manee Jaidee',
    'actor.name': 'Anong Wattana',
    'step.label': 'Department manager',
    remark: 'The licence is not available on the current agreement.',
    'access.count': '4',
    'employee.name': 'Somchai Suksawat',
    'employee.code': 'EMP-1042',
    'employee.position': 'Asst. Manager',
    'employee.section': 'System analyst',
    'employee.department': 'Information Technology',
    'employee.working': '2026-09-01',
    'digest.count': '2',
    'digest.open_count': '2',
    // Same numbers as the API preview sample: 2 waiting + 1 in progress = 3.
    'digest.working_count': '1',
    'digest.total': '3',
    'digest.expiring_count': '2',
    'digest.overdue_count': '1',
    'app.name': 'IT Service Desk',
    // Tables are filled by the API preview; listed here for the variable chips only.
    'asset.table': '',
    'digest.table': '',
    'digest.open_table': '',
    'digest.working_table': '',
    'digest.expiring_table': '',
    'digest.overdue_table': '',
    'access.table': '',
    'stock.request_summary_table': '',
    'stock.requests_table': '',
    'request.approval_history': '',
    'stock.summary_table': '',
    'stock.items_table': '',
};

// Sample values that are dates, written in the date setting as the sent mail is.
const SAMPLE_DATE_KEYS = new Set([
    'report.period',
    'stock.request_date',
    'stock.fulfilled_date',
    'employee.last_working',
    'contract.end_date',
    'request.date',
    'request.approved_date',
    'request.rejected_date',
    'request.cancelled_date',
    'request.completed_date',
    'employee.working',
]);

function samplesIn(fmt: DateFormatter): Record<string, string> {
    return Object.fromEntries(
        Object.entries(SAMPLE_VARS).map(([key, value]) => {
            if (!SAMPLE_DATE_KEYS.has(key)) return [key, value];
            const [from, to] = value.split('|');
            return [key, to ? fmt.range(from, to) : fmt.date(from)];
        }),
    );
}

// Every variable an author can insert, A-Z.
const VARIABLE_NAMES = Object.keys(SAMPLE_VARS).sort((a, b) => a.localeCompare(b));

/** When a template goes out and to whom (email_when_* / email_to_*); null when no text exists for it. */
function templateAudience(t: (key: string) => string, key: string): { when: string; to: string } | null {
    const id = key.replace(/\./g, '_');
    const when = t(`email_when_${id}`);
    if (when === `email_when_${id}`) return null;
    return { when, to: t(`email_to_${id}`) };
}

/** The editor header's "When: …   To: …" line; the technical key for a template it can't describe. */
/** The email rights the server checks per change (EmailTemplateController): toggle, edit wording, test; Reset needs edit and toggle. */
function useEmailRights() {
    const { can } = useAuth();
    const edit = can('notifications.email_edit');
    const toggle = can('notifications.email_toggle');

    return { edit, toggle, test: can('notifications.email_test'), reset: edit && toggle, any: edit || toggle };
}

function TemplateAudienceLine({ templateKey }: { templateKey: string }) {
    const t = useT();
    const audience = templateAudience(t, templateKey);
    if (!audience) return <span className="text-muted-foreground text-xs">{templateKey}</span>;

    return (
        <span title={templateKey} className="text-muted-foreground inline-flex flex-wrap gap-x-5 text-xs">
            <span>
                {t('email_when_label')} <span className="text-foreground">{audience.when}</span>
            </span>
            <span>
                {t('email_to_label')} <span className="text-foreground">{audience.to}</span>
            </span>
        </span>
    );
}

/** The {{variables}} in a piece of wording, without duplicates. */
function variablesIn(text: string): string[] {
    return Array.from(new Set(Array.from(text.matchAll(/\{\{([\w.]+)\}\}/g), (m) => m[1])));
}

/** Tokens this template's mail is not given, which would reach the reader as literal {{text}}. */
function unknownVariables(tokens: string[], variables: string[] | null): string[] {
    return variables ? tokens.filter((tk) => !variables.includes(tk)) : [];
}

/** A warning sentence with its <tags> in code type, the rest in the normal font. */
function TagText({ text }: { text: string }) {
    return <>{text.split(/(<\/?[a-zA-Z0-9]+>)/).map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>;
}

/** One fixed-height line under the body editor: HTML sound or not; the full list opens on click. */
function HtmlStatusBar({ issues, lineCount, openAt }: { issues: HtmlIssue[]; lineCount: number; openAt?: { line: number } | null }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [focusLine, setFocusLine] = useState<number | null>(null);
    // The list portals into the dialog, or its clicks are dead.
    const [container, setContainer] = useState<HTMLElement | null>(null);

    // A tap on a red line number opens this list on that line
    useEffect(() => {
        if (!openAt) return;
        setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
        setFocusLine(openAt.line);
        setOpen(true);
    }, [openAt]);
    const total = (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">{t('email_html_line_count').replace('{count}', fmtN(lineCount))}</span>
    );

    if (issues.length === 0) {
        return (
            <div className="border-border bg-brand/5 text-brand-ink flex h-7 shrink-0 items-center gap-1.5 border-t px-2.5 text-xs">
                <span role="status" className="inline-flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {t('email_html_ok')}
                </span>
                {total}
            </div>
        );
    }

    return (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-t border-red-200 bg-red-50 px-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <span role="status" className="sr-only">
                {t('email_html_bad')}
            </span>
            <Popover
                open={open}
                onOpenChange={(next) => {
                    if (next) {
                        setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
                        setFocusLine(null);
                    }
                    setOpen(next);
                }}
            >
                <PopoverTrigger asChild>
                    <button
                        ref={triggerRef}
                        type="button"
                        className="inline-flex min-w-0 items-center gap-1.5 rounded font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-hidden"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {t('email_html_bad')}
                        <ChevronUp
                            className={cn('h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                            aria-hidden
                        />
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    container={container}
                    side="top"
                    align="start"
                    // The editor marks Esc handled first, so this list closes itself.
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') setOpen(false);
                    }}
                    className="w-[min(34rem,90vw)] p-0 text-xs"
                >
                    <div className="border-border flex items-center gap-2 border-b px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-700 dark:text-red-400" aria-hidden />
                        <span className="font-semibold">{t('email_html_bad')}</span>
                        <span className="text-muted-foreground ml-auto tabular-nums">
                            {issues.length === 1 ? t('email_html_count_one') : t('email_html_count').replace('{count}', fmtN(issues.length))}
                        </span>
                    </div>
                    <div className="max-h-60 overflow-y-auto px-3">
                        <HtmlIssueList issues={issues} limit={issues.length} focusLine={focusLine} />
                    </div>
                    <p className="text-muted-foreground border-border border-t px-3 py-2 leading-relaxed">{t('email_html_hint')}</p>
                </PopoverContent>
            </Popover>
            {total}
        </div>
    );
}

/** The first few HTML mistakes, one per line; "and N more" shows the rest. */
function HtmlIssueList({ issues, limit = 3, focusLine = null }: { issues: HtmlIssue[]; limit?: number; focusLine?: number | null }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? issues : issues.slice(0, limit);
    const hidden = issues.length - shown.length;

    return (
        <ul className="divide-border divide-y">
            {shown.map((issue, i) => (
                <li
                    key={i}
                    ref={
                        issue.line === focusLine && shown.findIndex((x) => x.line === focusLine) === i
                            ? (el) => el?.scrollIntoView({ block: 'nearest' })
                            : undefined
                    }
                    className={cn('grid grid-cols-[3.75rem_minmax(0,1fr)] gap-2 py-1.5', issue.line === focusLine && '-mx-3 bg-red-500/10 px-3')}
                >
                    <span className="text-xs text-red-700 tabular-nums dark:text-red-400">
                        {t('email_html_line').replace('{line}', fmtN(issue.line))}
                    </span>
                    <span className="text-foreground">
                        <TagText text={htmlIssueMessage(issue, t)} />
                    </span>
                </li>
            ))}
            {hidden > 0 && (
                <li className="py-1.5">
                    <button type="button" onClick={() => setShowAll(true)} className="text-brand-ink underline-offset-2 hover:underline">
                        {t('email_html_more').replace('{count}', fmtN(hidden))}
                    </button>
                </li>
            )}
        </ul>
    );
}

// Note key beside the variable chips for placeholders that are not a simple field.
const TABLE_VARS = [
    'asset.table',
    'digest.table',
    'digest.open_table',
    'digest.working_table',
    'digest.expiring_table',
    'digest.overdue_table',
    'access.table',
    'stock.request_summary_table',
    'stock.requests_table',
    'request.approval_history',
    'stock.summary_table',
    'stock.items_table',
];
const VAR_NOTE: Record<string, string> = {
    count: 'email_var_note_number',
    ...Object.fromEntries(TABLE_VARS.map((key) => [key, 'email_var_note_table'])),
};

// Badge per cadence: blue = sent on the event, the others = sent by a schedule.
const CADENCE_META: Record<EmailTemplate['cadence'], { badge: string; labelKey: string }> = {
    realtime: { badge: 'bg-blue-500/12 text-blue-700 dark:text-blue-400', labelKey: 'email_cadence_realtime' },
    daily: { badge: 'bg-amber-500/12 text-amber-700 dark:text-amber-400', labelKey: 'email_cadence_daily' },
    weekly: { badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-400', labelKey: 'email_cadence_weekly' },
    scheduled: { badge: 'bg-teal-500/12 text-teal-700 dark:text-teal-400', labelKey: 'email_cadence_scheduled' },
};

const TAB_IDS = ['email', 'notification', 'log'] as const;
type EmailTab = (typeof TAB_IDS)[number];
const isEmailTab = (v: string | null): v is EmailTab => v != null && (TAB_IDS as readonly string[]).includes(v);
const TAB_LABEL_KEYS: Record<EmailTab, string> = { email: 'email_tab_email', notification: 'email_tab_notification', log: 'email_tab_log' };

// Module chip labels: a template key's prefix to the module name the menu uses.
const MODULE_LABEL_KEYS: Record<string, string> = {
    access: 'access_title',
    asset: 'assets',
    contract: 'contracts',
    employee: 'employees',
    report: 'reports',
    request: 'requests',
    stock: 'stock',
    ticket: 'tickets',
};

// Badge per delivery outcome; skipped (nobody to send to) is amber, not red.
const LOG_STATUS_META: Record<EmailLogStatus, { tone: 'green' | 'red' | 'amber'; labelKey: string }> = {
    sent: { tone: 'green', labelKey: 'email_log_sent' },
    failed: { tone: 'red', labelKey: 'email_log_failed' },
    skipped: { tone: 'amber', labelKey: 'email_log_skipped' },
};

/** Filter chips over the log: everything, then one per outcome. '' means no filter. */
const LOG_FILTERS = ['', 'sent', 'failed', 'skipped'] as const;

// List and dialog params of the three tabs; a tab switch clears these (rows-per-page stays).
const TAB_LIST_KEYS = ['search', 'module', 'status', 'page', 'dialog', 'view'];

const SEARCH_INPUT_PROPS = { type: 'search', autoComplete: 'off', spellCheck: false } as const;

/** A filter chip with its count; aria-pressed carries the selection, not colour alone. */
function FilterChip({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) {
    const lang = useUiStore((s) => s.lang);
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                'focus-visible:ring-brand/40 flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden',
                selected ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
        >
            {label}
            {count != null && <span className="font-semibold tabular-nums">{formatNumber(count, lang)}</span>}
        </button>
    );
}

function render(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{([\w.]+)\}\}/g, (_m, k) => vars[k] ?? `{{${k}}}`);
}

// Escapes text for the highlight overlay (innerHTML); only our own <span>s are markup.
function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Colour-codes HTML for the editor overlays: variables violet, tags sky; all user text escaped. */
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
            // No bold or padding: glyph width must match the textarea's caret.
            out += `<span class="rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">${escapeHtml(m[2])}</span>`;
        }
        last = re.lastIndex;
    }
    out += escapeHtml(src.slice(last));
    return out;
}

/** One line coloured like the rest, with the parts `marks` cover underlined in red. */
function highlightLine(text: string, from: number, marks: HtmlIssue[]): string {
    const to = from + text.length;
    const cuts = marks
        .filter((mark) => mark.start < to && mark.end > from)
        .map((mark) => [Math.max(mark.start, from) - from, Math.min(mark.end, to) - from] as const)
        .sort((a, b) => a[0] - b[0]);
    let out = '';
    let at = 0;
    for (const [cutStart, cutEnd] of cuts) {
        if (cutEnd <= at) continue;
        const begin = Math.max(cutStart, at);
        out += highlightHtml(text.slice(at, begin));
        // An underline only: glyph width must match the textarea's caret.
        out += `<span class="underline decoration-red-500 decoration-wavy underline-offset-2">${highlightHtml(text.slice(begin, cutEnd))}</span>`;
        at = cutEnd;
    }
    return out + highlightHtml(text.slice(at));
}

/** The body editor's colour layer, one numbered line per row; a red number shows its problems on hover. */
function BodyHighlight({
    value,
    marks,
    layerRef,
    onLineClick,
}: {
    value: string;
    marks: HtmlIssue[];
    layerRef: RefObject<HTMLDivElement | null>;
    onLineClick?: (line: number) => void;
}) {
    const t = useT();
    let offset = 0;
    const rows = value.split('\n').map((text, i) => {
        const html = highlightLine(text, offset, marks);
        offset += text.length + 1;
        return { number: i + 1, html };
    });

    return (
        <div
            ref={layerRef}
            aria-hidden="true"
            className="text-foreground pointer-events-none absolute inset-0 overflow-hidden py-2 pr-3 text-xs break-words whitespace-pre-wrap [scrollbar-gutter:stable]"
        >
            {rows.map((row) => {
                const lineIssues = marks.filter((mark) => mark.line === row.number);

                return (
                    <div key={row.number} className="relative pl-11">
                        <span
                            onClick={lineIssues.length > 0 ? () => onLineClick?.(row.number) : undefined}
                            className={cn(
                                'absolute left-0 w-8 text-right select-none',
                                lineIssues.length > 0
                                    ? 'group pointer-events-auto cursor-help text-red-500 dark:text-red-400'
                                    : 'text-muted-foreground/60',
                            )}
                        >
                            {row.number}
                            {lineIssues.length > 0 && (
                                <span
                                    role="tooltip"
                                    className="bg-foreground text-background invisible absolute top-0 left-full z-10 ml-2 w-max max-w-xs space-y-0.5 rounded-md px-2 py-1 text-left text-xs leading-snug whitespace-normal shadow-md group-hover:visible"
                                >
                                    {lineIssues.map((issue, i) => (
                                        <span key={i} className="block">
                                            <TagText text={htmlIssueMessage(issue, t)} />
                                        </span>
                                    ))}
                                </span>
                            )}
                        </span>
                        <span dangerouslySetInnerHTML={{ __html: row.html || '&#8203;' }} />
                    </div>
                );
            })}
        </div>
    );
}

// Single quick-tool button in the Body editor toolbar (icon + tooltip).
function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            aria-label={title}
            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-brand/40 flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
        >
            {children}
        </button>
    );
}

export default function EmailTemplatesPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const { can } = useAuth();
    const { data, isLoading, isError, refetch } = useEmailTemplates();
    const { update, test, reset, resetAll } = useEmailTemplateMutations();
    const rights = useEmailRights();
    const canLogs = can('notifications.logs');
    const tabIds = TAB_IDS.filter((id) => id !== 'log' || canLogs);
    // Active tab in ?tab=; each tab's search, filter chip, page and rows-per-page in the URL.
    const [tab, changeTab] = useTabParam((v): v is EmailTab => isEmailTab(v) && (v !== 'log' || canLogs), 'email');
    const list = useListParams();
    const search = list.get('search');

    // A new tab starts unfiltered on page 1.
    const switchTab = (next: EmailTab) => {
        if (next === tab) return;
        changeTab(next, { omitWhen: 'email', extra: (params) => TAB_LIST_KEYS.forEach((key) => params.delete(key)) });
    };

    const templates = useMemo(() => data?.data ?? [], [data]);
    const stats = data?.stats;

    // The editor lives in ?dialog=<id>: links and reloads reopen it, Back closes it.
    const templateIds = useMemo(() => templates.map((tp) => String(tp.id)), [templates]);
    const [dialogId, setDialogId] = useDialogParam(templateIds);
    const editing = tab === 'email' && dialogId !== null ? (templates.find((tp) => String(tp.id) === dialogId) ?? null) : null;
    const setEditing = (tp: EmailTemplate | null) => setDialogId(tp ? String(tp.id) : null);

    // Module prefixes from the keys ("ticket" from "ticket.created") with their counts.
    const modules = useMemo(() => {
        const counts: Record<string, number> = {};
        templates.forEach((tp) => {
            const mod = tp.key.split('.')[0];
            counts[mod] = (counts[mod] ?? 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    }, [templates]);
    // An unknown ?module= reads as All once the templates have loaded.
    const urlModule = list.get('module');
    const module = !data || modules.some(([mod]) => mod === urlModule) ? urlModule : '';
    const moduleLabel = (mod: string) => (MODULE_LABEL_KEYS[mod] ? t(MODULE_LABEL_KEYS[mod]) : mod);

    const rows = useMemo(() => {
        let list = templates;
        if (module) list = list.filter((tp) => tp.key.startsWith(module + '.'));
        list = list.filter((tp) => matchesAllWords(`${tp.name} ${tp.key}`, search));
        return list;
    }, [templates, module, search]);

    const toggle = (tp: EmailTemplate) =>
        update.mutate(
            { id: tp.id, payload: { enabled: !tp.enabled } },
            { onError: () => useToastStore.getState().push(t('cred_err_generic'), 'error') },
        );
    const togglingId = update.isPending && update.variables?.payload.enabled !== undefined ? update.variables.id : null;

    const templateColumns: Column<EmailTemplate>[] = [
        {
            key: 'code',
            header: t('email_col_id'),
            className: 'w-[8%]',
            render: (tp) => <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">{tp.code}</span>,
        },
        {
            key: 'name',
            header: t('email_template'),
            className: 'w-[30%] max-w-0',
            render: (tp) => (
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{tp.name}</span>
                    {tp.is_modified && (
                        <span className="shrink-0 rounded-md bg-amber-500/12 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            {t('email_modified')}
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: 'key',
            header: t('email_audience_col'),
            className: 'w-[26%] max-w-0',
            render: (tp) => {
                const audience = templateAudience(t, tp.key);
                if (!audience) return <span className="bg-muted rounded-md px-2 py-0.5 text-xs">{tp.key}</span>;
                return (
                    <div title={tp.key} className="min-w-0">
                        <div className="truncate text-xs">{audience.when}</div>
                        <div className="text-muted-foreground truncate text-xs">
                            {t('email_to_label')} {audience.to}
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'cadence',
            header: t('email_type'),
            className: 'w-[11%]',
            hideBelow: 'lg',
            render: (tp) => (
                <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap', CADENCE_META[tp.cadence].badge)}>
                    {t(CADENCE_META[tp.cadence].labelKey)}
                </span>
            ),
        },
        {
            key: 'last_sent',
            header: t('email_last_sent'),
            className: 'w-[13%]',
            hideBelow: 'lg',
            render: (tp) => (
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {relativeTime(tp.last_sent_at, t, t('email_never_sent'), fmtN)}
                </span>
            ),
        },
        {
            key: 'enabled',
            header: t('email_enabled'),
            className: 'w-[7%]',
            // The switch sits in a clickable row, so it keeps its own click.
            render: (tp) => (
                <DisabledReason reason={rights.toggle ? null : t('email_no_toggle_right')} label={t('email_enabled')}>
                    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                        <Switch
                            checked={tp.enabled}
                            onChange={() => toggle(tp)}
                            disabled={togglingId === tp.id || !rights.toggle}
                            aria-label={t('email_toggle_named').replace('{name}', tp.name)}
                        />
                    </span>
                </DisabledReason>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            className: 'w-[5%]',
            render: (tp) => (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditing(tp);
                    }}
                    aria-label={`${t(rights.any ? 'email_edit_preview' : 'email_view')} ${tp.name}`}
                    title={t(rights.any ? 'email_edit_preview' : 'email_view')}
                    className="hover:bg-accent text-muted-foreground hover:text-foreground focus-visible:ring-brand/40 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden"
                >
                    {rights.any ? <PenLine className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
            ),
        },
    ];

    // Any standard template differing from its standard shows "Reset all".
    const anyModified = useMemo(() => templates.some((tp) => tp.is_modified), [templates]);

    const resetAllToStandard = async () => {
        await confirm({
            variant: 'warn',
            title: t('email_reset_all_title'),
            description: t('email_reset_all_text'),
            confirmText: t('email_reset_confirm'),
            action: () => resetAll.mutateAsync(),
        });
    };

    return (
        <div className="space-y-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('email_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('email_sub')}</p>
                </div>
                {tab === 'email' && anyModified && (
                    <DisabledReason reason={rights.reset ? null : t('email_no_reset_right')} label={t('email_reset_all')}>
                        <Button variant="outline" onClick={resetAllToStandard} disabled={resetAll.isPending || !rights.reset}>
                            {resetAll.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                                <RotateCcw className="h-4 w-4" aria-hidden />
                            )}
                            {t('email_reset_all')}
                        </Button>
                    </DisabledReason>
                )}
            </div>

            {/* Figures of whichever tab is open */}
            {tab === 'notification' ? (
                <NotificationSettingsStats />
            ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard label={t('email_templates')} value={String(stats?.templates ?? '—')} icon={Mail} loading={isLoading} />
                    <StatCard label={t('email_enabled')} value={String(stats?.enabled ?? '—')} icon={Check} loading={isLoading} />
                    <StatCard label={t('email_sent_today')} value={String(stats?.sent_today ?? '—')} icon={Send} loading={isLoading} />
                    {stats && !stats.mail_configured ? (
                        // No SMTP yet: say so instead of a rate made of mail that never left
                        <StatCard
                            label={t('email_delivery')}
                            value={t('email_delivery_not_set')}
                            icon={AlertTriangle}
                            alert="amber"
                            footer={t(can('settings.email') ? 'email_delivery_set_up' : 'email_delivery_ask_admin')}
                            onClick={can('settings.email') ? () => navigate('/settings?tab=email') : undefined}
                        />
                    ) : (
                        <StatCard
                            label={t('email_delivery')}
                            value={stats?.delivery_rate != null ? fmtN(stats.delivery_rate, { maxDecimals: 1 }) : '—'}
                            unit={stats?.delivery_rate != null ? '%' : undefined}
                            icon={History}
                            loading={isLoading}
                            footer={
                                stats && stats.delivery_attempts > 0
                                    ? t('email_delivery_window')
                                          .replace('{sent}', fmtN(stats.delivery_sent))
                                          .replace('{total}', fmtN(stats.delivery_attempts))
                                    : t('email_delivery_window_none')
                            }
                            onClick={canLogs ? () => switchTab('log') : undefined}
                        />
                    )}
                </div>
            )}

            <Card className="overflow-clip">
                <PageTabs tabs={tabIds.map((id) => ({ id, label: t(TAB_LABEL_KEYS[id]) }))} active={tab} onChange={switchTab} />

                {tab === 'notification' && <NotificationSettingsPane />}
                {tab === 'log' && <DeliveryLogPane />}

                {tab === 'email' && (
                    <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-muted-foreground text-xs">{t('email_templates_sub')}</div>
                            <div className="relative w-full max-w-xs">
                                <Search
                                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                                    aria-hidden
                                />
                                <Input
                                    {...SEARCH_INPUT_PROPS}
                                    name="search"
                                    aria-label={searchLabel(t('email_search'))}
                                    value={search}
                                    onChange={(e) => list.setFilter('search', e.target.value)}
                                    placeholder={t('email_search')}
                                    className="pl-9 text-ellipsis"
                                />
                            </div>
                        </div>

                        {/* Module filter chips */}
                        <div className="flex flex-wrap gap-1.5">
                            <FilterChip
                                label={t('all')}
                                count={templates.length}
                                selected={module === ''}
                                onClick={() => list.setFilter('module', '')}
                            />
                            {modules.map(([mod, count]) => (
                                <FilterChip
                                    key={mod}
                                    label={moduleLabel(mod)}
                                    count={count}
                                    selected={module === mod}
                                    onClick={() => list.setFilter('module', mod)}
                                />
                            ))}
                        </div>

                        <DataTable
                            columns={templateColumns}
                            rows={rows}
                            rowKey={(tp) => tp.id}
                            loading={isLoading}
                            rowHeight={45}
                            onRowClick={setEditing}
                            paging={list.table.paging}
                            caption={t('email_templates')}
                            emptyState={isError ? <LoadFailed onRetry={() => refetch()} /> : undefined}
                            empty={
                                search || module
                                    ? { kind: 'search', title: t('email_empty_templates_filtered'), hint: t('email_empty_templates_filtered_hint') }
                                    : { title: t('email_empty_templates_none'), hint: t('email_empty_templates_none_hint') }
                            }
                        />
                    </div>
                )}
            </Card>

            <EditorDialog
                template={editing}
                fromAddress={data?.mail?.from_address || SAMPLE_VARS['user.email']}
                onClose={() => setEditing(null)}
                onSave={(payload) => (editing ? update.mutateAsync({ id: editing.id, payload }) : Promise.resolve())}
                saving={update.isPending && update.variables?.payload.enabled === undefined}
                onToggle={(id, enabled) => update.mutateAsync({ id, payload: { enabled } })}
                onTest={(id, draft) => test.mutateAsync({ id, draft })}
                testing={test.isPending}
                onReset={(id) => reset.mutateAsync(id)}
                resetting={reset.isPending}
            />
        </div>
    );
}

// Debounced render of the unsaved content through the real email layout; only the newest request may land.
function useLivePreview(enabled: boolean, templateKey: string | undefined, name: string, subject: string, body: string) {
    const [previewHtml, setPreviewHtml] = useState('');
    const [rendering, setRendering] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const latest = useRef(0);

    useEffect(() => {
        if (!enabled) return;
        const request = ++latest.current;
        setRendering(true);
        const id = window.setTimeout(() => {
            emailTemplateApi
                .renderPreview({ key: templateKey, name, subject, body_html: body })
                .then((html) => {
                    if (request !== latest.current) return;
                    setPreviewHtml(html);
                    setFailed(false);
                })
                .catch(() => {
                    if (request === latest.current) setFailed(true);
                })
                .finally(() => {
                    if (request === latest.current) setRendering(false);
                });
        }, 400);
        return () => window.clearTimeout(id);
    }, [enabled, templateKey, name, subject, body, attempt]);

    // Closing drops any request still in flight.
    useEffect(() => {
        if (!enabled) latest.current++;
    }, [enabled]);

    const clear = () => {
        setPreviewHtml('');
        setFailed(false);
    };

    return { previewHtml, rendering, failed, retry: () => setAttempt((n) => n + 1), clear };
}

// Single-line subject input over a colour layer that highlights {{variables}} and tags.
function SubjectField({
    value,
    onChange,
    readOnly = false,
    ...control
}: { value: string; onChange: (v: string) => void; readOnly?: boolean } & Partial<FieldControlProps>) {
    const hlRef = useRef<HTMLDivElement>(null);
    return (
        <div className="border-input bg-background hover:border-brand/50 focus-within:border-brand focus-within:ring-brand/15 relative h-10 rounded-md border transition-colors focus-within:ring-[3px]">
            <div
                ref={hlRef}
                aria-hidden="true"
                className="text-foreground pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 text-base whitespace-pre md:text-sm"
                dangerouslySetInnerHTML={{ __html: highlightHtml(value) }}
            />
            <input
                {...control}
                name="subject"
                autoComplete="off"
                readOnly={readOnly}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onScroll={(e) => {
                    const h = hlRef.current;
                    if (h) h.scrollLeft = e.currentTarget.scrollLeft;
                }}
                spellCheck={false}
                className="caret-foreground absolute inset-0 h-full w-full bg-transparent px-3 text-base text-transparent outline-hidden md:text-sm"
            />
        </div>
    );
}

/** Body HTML editor: quick tools, a highlighted textarea and the variable chips (subject's included). */
function BodyEditor({
    value,
    onChange,
    extraText = '',
    variables,
    readOnly = false,
    ...control
}: {
    value: string;
    onChange: (v: string) => void;
    extraText?: string;
    readOnly?: boolean;
    /** What this template's mail is given; null offers every known variable and flags none. */
    variables: string[] | null;
} & Partial<FieldControlProps>) {
    const t = useT();
    const ref = useRef<HTMLTextAreaElement>(null);
    const hlRef = useRef<HTMLDivElement>(null);
    const [issueAt, setIssueAt] = useState<{ line: number } | null>(null);

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
            const text = `<a href="">${sel || t('email_link_text')}</a>`;
            return { text, selStart: 9, selEnd: 9 };
        });
    const insertList = () =>
        editBody((sel) => {
            const lines = sel ? sel.split('\n').filter((l) => l.trim() !== '') : [''];
            const text = `<ul>\n${lines.map((l) => `  <li>${l}</li>`).join('\n')}\n</ul>`;
            const pos = text.indexOf('</li>');
            return { text, selStart: pos, selEnd: pos };
        });

    // The variables this template uses, A-Z, so names stay where they were seen.
    const tokens = variablesIn(`${extraText} ${value}`).sort((a, b) => a.localeCompare(b));
    // Offer only what this mail is given; others would go out as literal {{text}}.
    const offered = variables ?? VARIABLE_NAMES;
    const unknownTokens = unknownVariables(tokens, variables);
    const htmlIssues = useMemo(() => findHtmlIssues(value), [value]);

    return (
        <div className="flex h-full min-h-[24rem] flex-col lg:min-h-0">
            <div className="border-input bg-background focus-within:border-brand flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                {/* Quick tools */}
                <div
                    className={cn(
                        CARD_HEADING,
                        'border-border flex shrink-0 flex-wrap items-center gap-0.5 border-b px-1.5 py-1',
                        readOnly && 'hidden',
                    )}
                >
                    <ToolBtn title={t('email_tool_bold')} onClick={() => wrap('<strong>', '</strong>')}>
                        <Bold className="h-3.5 w-3.5" aria-hidden />
                    </ToolBtn>
                    <ToolBtn title={t('email_tool_italic')} onClick={() => wrap('<em>', '</em>')}>
                        <Italic className="h-3.5 w-3.5" aria-hidden />
                    </ToolBtn>
                    <span className="bg-border mx-1 h-4 w-px" />
                    <ToolBtn title={t('email_tool_br')} onClick={() => insert('<br>\n')}>
                        <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
                    </ToolBtn>
                    <ToolBtn title={t('email_tool_p')} onClick={() => wrap('<p>', '</p>')}>
                        <Pilcrow className="h-3.5 w-3.5" aria-hidden />
                    </ToolBtn>
                    <ToolBtn title={t('email_tool_list')} onClick={insertList}>
                        <List className="h-3.5 w-3.5" aria-hidden />
                    </ToolBtn>
                    <span className="bg-border mx-1 h-4 w-px" />
                    <ToolBtn title={t('email_tool_link')} onClick={insertLink}>
                        <Link2 className="h-3.5 w-3.5" aria-hidden />
                    </ToolBtn>
                    <select
                        name="insert_variable"
                        value=""
                        onChange={(e) => {
                            if (e.target.value) insertVar(e.target.value);
                            e.currentTarget.value = '';
                        }}
                        aria-label={t('email_insert_var')}
                        title={t('email_insert_var')}
                        className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-brand/40 ml-auto h-7 cursor-pointer rounded bg-transparent px-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                        <option value="">{`{{ }} ${t('email_insert_var')}`}</option>
                        {offered.map((k) => (
                            <option key={k} value={k}>{`{{${k}}}`}</option>
                        ))}
                    </select>
                </div>
                {/* Coloured layer under a transparent, scroll-synced textarea */}
                <div className="relative min-h-[10rem] flex-1">
                    <div aria-hidden="true" className="bg-muted/40 border-border pointer-events-none absolute inset-y-0 left-0 w-9 border-r" />
                    <BodyHighlight value={value} marks={htmlIssues} layerRef={hlRef} onLineClick={(line) => setIssueAt({ line })} />
                    <textarea
                        {...control}
                        ref={ref}
                        name="body_html"
                        readOnly={readOnly}
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
                        className="caret-foreground absolute inset-y-0 right-0 left-9 block h-full resize-none overflow-auto bg-transparent py-2 pr-3 pl-2 text-xs break-words whitespace-pre-wrap text-transparent outline-none [scrollbar-gutter:stable]"
                    />
                </div>
                <HtmlStatusBar issues={htmlIssues} lineCount={value.split('\n').length} openAt={issueAt} />
            </div>

            {tokens.length > 0 && (
                <div className="mt-3 shrink-0">
                    <div className="text-muted-foreground mb-2 text-xs font-semibold">{t('email_variables')}</div>
                    <div className="flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto">
                        {tokens.map((tk) => {
                            const unknown = unknownTokens.includes(tk);

                            return (
                                <button
                                    key={tk}
                                    type="button"
                                    onClick={() => insertVar(tk)}
                                    disabled={readOnly}
                                    title={unknown ? t('email_var_unknown') : t('email_insert_var')}
                                    className={cn(
                                        'focus-visible:ring-brand/40 inline-flex min-h-6 items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                                        unknown
                                            ? 'bg-red-50 text-red-700 ring-1 ring-red-300 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800'
                                            : 'bg-muted hover:bg-accent',
                                    )}
                                >
                                    {unknown && <AlertTriangle className="h-3 w-3" aria-hidden />}
                                    {`{{${tk}}}`}
                                    {VAR_NOTE[tk] && <span className="text-muted-foreground ml-1 text-xs">{t(VAR_NOTE[tk])}</span>}
                                </button>
                            );
                        })}
                    </div>
                    {unknownTokens.length > 0 ? (
                        <p className="mt-1.5 text-xs text-red-700 dark:text-red-400">{t('email_var_unknown_hint')}</p>
                    ) : (
                        <p className="text-muted-foreground mt-1.5 text-xs">{t('email_var_hint')}</p>
                    )}
                </div>
            )}
        </div>
    );
}

/** The sent email at its own height; sandboxed to same-origin only, which the measuring needs. */
function SentEmailFrame({ html, title, className }: { html: string; title: string; className?: string }) {
    const ref = useRef<HTMLIFrameElement>(null);
    const observer = useRef<ResizeObserver | null>(null);
    const [height, setHeight] = useState(420);

    useEffect(() => () => observer.current?.disconnect(), []);

    const onLoad = () => {
        const doc = ref.current?.contentDocument;
        if (!doc?.body) return;
        // Links stay inert: the preview is not a browser.
        doc.addEventListener('click', (e) => {
            if ((e.target as HTMLElement | null)?.closest?.('a')) e.preventDefault();
        });
        // Refit when the width changes (dialog resize, tablet rotation).
        const fit = () => setHeight(doc.body.scrollHeight + 8);
        fit();
        observer.current?.disconnect();
        observer.current = new ResizeObserver(fit);
        observer.current.observe(doc.body);
    };

    return (
        <iframe
            ref={ref}
            title={title}
            srcDoc={html}
            sandbox="allow-same-origin"
            onLoad={onLoad}
            style={{ height }}
            className={cn('border-border block w-full rounded-xl border bg-white', className)}
        />
    );
}

/** One log entry: who it went to, what it said, and the email rebuilt as it was received. */
function DeliveryLogDrawer({ logId, onClose }: { logId: number | null; onClose: () => void }) {
    const fmt = useDateFormat();
    const t = useT();
    const { data, isError, refetch } = useEmailLog(logId);
    const { record: log } = useRecordView(logId, data);
    const meta = log ? LOG_STATUS_META[log.status] : null;

    return (
        <Dialog open={logId != null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex max-h-[min(860px,calc(100dvh-72px))] w-[calc(100vw-2rem)] max-w-[820px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                {log && meta ? (
                    <FocusDialogHeader
                        icon={Mail}
                        eyebrow={log.template_key ?? '—'}
                        title={log.subject}
                        srDescription={t('email_log_sub')}
                        subtitle={
                            <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                                <span>{fmt.dateTime(log.created_at)}</span>
                                <span className="break-all">
                                    {log.recipient_name
                                        ? `${log.recipient_name} (${log.to_email ?? t('email_log_no_address')})`
                                        : (log.to_email ?? t('email_log_no_address'))}
                                </span>
                            </span>
                        }
                        headerRight={<StatusBadge tone={meta.tone}>{t(meta.labelKey)}</StatusBadge>}
                    />
                ) : (
                    <FocusDialogHeader
                        icon={Mail}
                        eyebrow={t('email_tab_log')}
                        title={isError ? t('load_failed') : t('loading')}
                        srDescription={t('email_log_sub')}
                    />
                )}

                <div className="border-border/60 flex-1 space-y-4 overflow-y-auto border-t p-6">
                    {log ? (
                        <>
                            {log.error && (
                                <div className="bg-muted/40 border-border rounded-xl border px-4 py-3">
                                    <div className="text-muted-foreground text-xs font-medium">{t('email_log_reason')}</div>
                                    <div className="mt-1 text-sm break-words">{log.error}</div>
                                </div>
                            )}

                            <div>
                                <SectionLabel>{t('email_log_content')}</SectionLabel>
                                {log.preview_html ? (
                                    <>
                                        <SentEmailFrame html={log.preview_html} title={t('email_log_content')} />
                                        {!log.action_recorded && (
                                            <p className="text-muted-foreground mt-2 text-xs">{t('email_log_action_not_recorded')}</p>
                                        )}
                                    </>
                                ) : (
                                    <EmptyState
                                        title={t('email_empty_log_detail_content')}
                                        hint={t('email_empty_log_detail_content_hint')}
                                        className="border-border min-h-0 rounded-xl border border-dashed py-8"
                                    />
                                )}
                            </div>
                        </>
                    ) : isError ? (
                        <div className="py-10 text-center">
                            <LoadFailed onRetry={() => refetch()} />
                        </div>
                    ) : (
                        <div className="space-y-3" aria-busy>
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-72 w-full rounded-xl" />
                        </div>
                    )}
                </div>

                <div className="border-border/60 bg-muted/30 flex items-center justify-end border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Every email the system tried to send, newest first; paginated server-side. */
function DeliveryLogPane() {
    const t = useT();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    // The open entry in ?view=<id>: links and reloads reopen it, Back closes it.
    const viewing = toRecordId(searchParams.get('view'));
    const openLog = (id: number) =>
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('view', String(id));
                return next;
            },
            { state: { viewPushed: true } },
        );
    const closeLog = () => {
        if ((location.state as { viewPushed?: boolean } | null)?.viewPushed) {
            navigate(-1);
            return;
        }
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('view');
                return next;
            },
            { replace: true },
        );
    };

    // Status chip, search, page and rows-per-page live in the URL (?status, search, page, per).
    const list = useListParams();
    const { page, perPage } = list;
    const urlStatus = list.get('status');
    const status = LOG_FILTERS.find((value) => value === urlStatus) ?? '';
    const setStatus = (value: EmailLogStatus | '') => list.setFilter('status', value);
    const query = list.get('search');

    // The box updates as typed; ?search (and page 1) follow 350ms after the last key.
    const [search, setSearch] = useState(query);
    useEffect(() => {
        if (search === query) return;
        const id = window.setTimeout(() => list.setFilter('search', search), 350);
        return () => window.clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, query, list.searchParams]);

    const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useEmailLogs(
        { page, per_page: perPage, search: query || undefined, status: status || undefined },
        true,
    );

    const rows = data?.data ?? [];
    const meta = data?.meta;
    const counts = meta?.counts;
    const dateWidth = useDateColumnWidth();

    const columns: Column<EmailLogRow>[] = [
        {
            key: 'created_at',
            header: t('email_log_time'),
            width: dateWidth,
            render: (r) => <DateTimeCell value={r.created_at} className="text-muted-foreground" />,
        },
        {
            key: 'template',
            header: t('email_trigger'),
            width: '168px',
            render: (r) => <TruncText text={r.template_key ?? '—'} className="text-xs" />,
        },
        {
            key: 'subject',
            header: t('email_subject'),
            minWidth: '16rem',
            render: (r) => <TruncText text={r.subject} className="text-xs" />,
        },
        {
            key: 'recipient',
            header: t('email_log_recipient'),
            width: '224px',
            // Name first when known; a skipped row has no address, so the name says who was left out.
            render: (r) =>
                r.recipient_name ? (
                    <div className="min-w-0">
                        <TruncText text={r.recipient_name} className="text-xs font-medium" />
                        <TruncText text={r.to_email ?? t('email_log_no_address')} className="text-muted-foreground mt-0.5 text-xs" />
                    </div>
                ) : (
                    <TruncText text={r.to_email ?? t('email_log_no_address')} className="text-xs" />
                ),
        },
        {
            key: 'status',
            header: t('status'),
            width: '116px',
            render: (r) => <StatusBadge tone={LOG_STATUS_META[r.status].tone}>{t(LOG_STATUS_META[r.status].labelKey)}</StatusBadge>,
        },
        {
            key: 'error',
            header: t('email_log_reason'),
            minWidth: '14rem',
            render: (r) => <TruncText text={r.error ?? '—'} className="text-muted-foreground text-xs" />,
        },
    ];

    return (
        <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-muted-foreground text-xs">{t('email_log_sub')}</div>
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" aria-hidden />
                    <Input
                        {...SEARCH_INPUT_PROPS}
                        name="search"
                        aria-label={searchLabel(t('email_log_search'))}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('email_log_search')}
                        className="pl-9 text-ellipsis"
                    />
                </div>
            </div>

            {/* Status chips with whole-log counts */}
            <div className="flex flex-wrap gap-1.5">
                {LOG_FILTERS.map((value) => (
                    <FilterChip
                        key={value || 'all'}
                        label={value === '' ? t('all') : t(LOG_STATUS_META[value].labelKey)}
                        count={counts?.[value || 'all']}
                        selected={status === value}
                        onClick={() => setStatus(value)}
                    />
                ))}
            </div>

            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                loading={isLoading || (isFetching && isPlaceholderData)}
                rowHeight={44}
                onRowClick={(r) => openLog(r.id)}
                caption={t('email_tab_log')}
                server={{
                    page,
                    pageSize: perPage,
                    total: meta?.total ?? 0,
                    onPageChange: list.table.paging.onPageChange,
                    onPageSizeChange: list.table.paging.onPageSizeChange,
                }}
                emptyState={
                    isError ? (
                        <div className="py-10 text-center">
                            <LoadFailed onRetry={() => refetch()} />
                        </div>
                    ) : undefined
                }
                empty={
                    query || status
                        ? { kind: 'search', title: t('email_empty_logs_filtered'), hint: t('email_empty_logs_filtered_hint') }
                        : { title: t('email_empty_logs_none'), hint: t('email_empty_logs_none_hint') }
                }
            />

            <DeliveryLogDrawer logId={viewing} onClose={closeLog} />
        </div>
    );
}

/** The live email as an inbox message: the header strip and card stay light in both themes, like the mail. */
function PreviewPane({
    brand,
    from,
    subject,
    previewHtml,
    rendering,
    failed,
    onRetry,
}: {
    brand: string;
    from: string;
    subject: string;
    previewHtml: string;
    rendering: boolean;
    failed: boolean;
    onRetry: () => void;
}) {
    const dateConfig = useUiStore((s) => s.dateConfig);
    const mailDates = useMemo(() => bindDateFormat(dateConfig, 'en'), [dateConfig]);
    const t = useT();
    // The signed-in account: where "Send test" delivers.
    const { user } = useAuth();
    return (
        <div className="bg-muted/30 border-border relative shrink-0 border-t p-5 lg:order-first lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-r">
            <span role="status" className={cn(!rendering && 'sr-only')}>
                {rendering && (
                    <span className="bg-background/90 text-muted-foreground absolute top-6 right-6 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs shadow-sm backdrop-blur-sm">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        {t('email_preview_updating')}
                    </span>
                )}
            </span>
            {failed && (
                <div
                    role="alert"
                    className="mx-auto mb-3 flex max-w-[640px] flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                    <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        {t('email_preview_failed')}
                    </span>
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        {t('retry')}
                    </Button>
                </div>
            )}
            <div className="mx-auto max-w-[640px] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700">
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
                    <div className="min-w-0">
                        <span className="text-slate-600">{t('email_preview_from')} </span>
                        <span className="break-all">{from}</span>
                    </div>
                    <div className="min-w-0">
                        <span className="text-slate-600">{t('email_preview_to')} </span>
                        <span className="break-all">{user?.email || SAMPLE_VARS['user.email']}</span>
                    </div>
                    <div className="w-full truncate font-semibold">
                        [{brand}] {render(subject, { ...samplesIn(mailDates), 'app.name': brand })}
                    </div>
                </div>
                {previewHtml ? (
                    <SentEmailFrame html={previewHtml} title={t('email_preview')} className="rounded-none border-0" />
                ) : failed ? (
                    <div className="px-6 py-16 text-center text-sm text-slate-600">{t('email_preview_failed')}</div>
                ) : (
                    <div className="space-y-3 p-6">
                        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                        <div className="h-28 w-full animate-pulse rounded bg-slate-100" />
                    </div>
                )}
            </div>
        </div>
    );
}

type WordingField = 'name' | 'subject' | 'body_html';
type WordingErrors = Partial<Record<WordingField, string>>;
const WORDING_FIELDS: WordingField[] = ['name', 'subject', 'body_html'];

/** The editor: form and live preview side by side on lg; under lg the form comes first, then the preview. */
function EditorDialog({
    template,
    fromAddress,
    onClose,
    onSave,
    saving,
    onToggle,
    onTest,
    testing,
    onReset,
    resetting,
}: {
    template: EmailTemplate | null;
    /** The address the system really sends from, for the preview's From line. */
    fromAddress: string;
    onClose: () => void;
    onSave: (p: { name: string; subject: string; body_html: string }) => Promise<unknown>;
    saving: boolean;
    /** Switches the template on or off straight away, the same call as the list's switch. */
    onToggle: (id: number, enabled: boolean) => Promise<unknown>;
    /** Resolves with whether the mail actually left — a rejected address is not a thrown error. */
    onTest: (id: number, draft: { name: string; subject: string; body_html: string }) => Promise<{ sent: boolean }>;
    testing: boolean;
    onReset: (id: number) => Promise<unknown>;
    resetting: boolean;
}) {
    const t = useT();
    const confirm = useConfirm();
    const { data: settings } = useSettings();
    const brand = settings?.brand_name || SAMPLE_VARS['app.name'];
    // Kept through the close animation so the content doesn't blank.
    const confirmEdit = useConfirmEdit();
    const rights = useEmailRights();
    const { record: shown } = useRecordView(template?.id ?? null, template);

    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    // The switch saves at once, so it is not part of the unsaved draft.
    const [enabled, setEnabled] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [base, setBase] = useState({ name: '', subject: '', body: '' });
    const [savedOk, setSavedOk] = useState(false);
    const [sentOk, setSentOk] = useState(false);
    const [resetOk, setResetOk] = useState(false);
    const [errors, setErrors] = useState<WordingErrors>({});
    const [attempt, setAttempt] = useState(0);
    const savingRef = useRef(false);
    // A confirm is open: Ctrl+S and a second save wait for it.
    const asking = useRef(false);
    const timers = useRef<number[]>([]);
    const formRef = useRef<HTMLDivElement>(null);

    const { previewHtml, rendering, failed, retry, clear } = useLivePreview(!!template, shown?.key, name, subject, body);

    useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
    const flash = (set: (on: boolean) => void) => {
        set(true);
        timers.current.push(window.setTimeout(() => set(false), 1600));
    };

    // Fill the form when a different template opens.
    useEffect(() => {
        if (template) {
            setName(template.name);
            setSubject(template.subject);
            setBody(template.body_html);
            setEnabled(template.enabled);
            setBase({ name: template.name, subject: template.subject, body: template.body_html });
            clear();
            setSavedOk(false);
            setSentOk(false);
            setResetOk(false);
            setErrors({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [template?.id]);

    const dirty = name !== base.name || subject !== base.subject || body !== base.body;
    const hasErrors = WORDING_FIELDS.some((field) => errors[field]);

    const edit = (field: WordingField, set: (v: string) => void) => (value: string) => {
        set(value);
        if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    // Red fields, the banner shakes, focus goes to the first one.
    const showErrors = (next: WordingErrors) => {
        setErrors(next);
        setAttempt((n) => n + 1);
        const first = WORDING_FIELDS.find((field) => next[field]);
        if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    };

    const handleSave = async () => {
        if (!template || !rights.edit || !dirty || saving || savingRef.current || asking.current) return;
        const values: Record<WordingField, string> = { name, subject, body_html: body };
        const missing: WordingErrors = {};
        for (const field of WORDING_FIELDS) {
            if (!values[field].trim()) missing[field] = t('email_err_required');
        }
        if (Object.keys(missing).length > 0) {
            showErrors(missing);
            return;
        }

        // Unknown variables go out as literal {{text}} and broken HTML renders differently per client: ask first.
        const unknown = unknownVariables(variablesIn(`${subject} ${body}`), template.variables);
        const htmlIssues = findHtmlIssues(body);
        if (unknown.length > 0 || htmlIssues.length > 0) {
            asking.current = true;
            const proceed = await confirm({
                variant: 'warn',
                title: t('email_check_title'),
                description: (
                    <div className="space-y-2 text-xs">
                        {unknown.length > 0 && (
                            <div>
                                <p>{t('email_var_unknown_text')}</p>
                                <p>{unknown.map((tk) => `{{${tk}}}`).join(', ')}</p>
                            </div>
                        )}
                        {htmlIssues.length > 0 && (
                            <div>
                                <p className="font-semibold">{t('email_html_bad')}</p>
                                <HtmlIssueList issues={htmlIssues} />
                            </div>
                        )}
                    </div>
                ),
                confirmText: t('email_var_unknown_confirm'),
            });
            asking.current = false;
            if (!proceed) return;
        } else {
            asking.current = true;
            const proceed = await confirmEdit({ name: template.name, sub: template.code });
            asking.current = false;
            if (!proceed) return;
        }

        savingRef.current = true;
        try {
            await onSave(values);
            setBase({ name, subject, body });
            setErrors({});
            flash(setSavedOk);
        } catch (e: unknown) {
            const response = (e as { response?: { status?: number; data?: { errors?: Record<string, string[]> } } })?.response;
            const serverErrors = response?.status === 422 ? response.data?.errors : undefined;
            const next: WordingErrors = {};
            for (const field of WORDING_FIELDS) {
                if (serverErrors?.[field]) next[field] = values[field].trim() ? serverErrors[field][0] : t('email_err_required');
            }
            if (Object.keys(next).length > 0) {
                showErrors(next);
            } else {
                useToastStore.getState().push(t('cred_err_generic'), 'error');
            }
        } finally {
            savingRef.current = false;
        }
    };

    // Flip the switch and save it at once; put it back if the save fails.
    const handleToggle = async () => {
        if (!template || !rights.toggle || toggling) return;
        const next = !enabled;
        setEnabled(next);
        setToggling(true);
        try {
            await onToggle(template.id, next);
        } catch {
            setEnabled(!next);
            useToastStore.getState().push(t('cred_err_generic'), 'error');
        } finally {
            setToggling(false);
        }
    };

    // Sends what is on screen, saved or not; the answer says whether the mail left.
    const handleTest = async () => {
        if (!template || testing) return;
        try {
            const { sent } = await onTest(template.id, { name, subject, body_html: body });
            if (!sent) {
                useToastStore.getState().push(t('email_test_failed'), 'error', t('email_test_failed_title'));
                return;
            }
            flash(setSentOk);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            useToastStore.getState().push(msg ?? t('email_test_failed'), 'error', t('email_test_failed_title'));
        }
    };

    // Back to the standard wording; the form and baseline take the refreshed row.
    const handleReset = async () => {
        if (!template || resetting || asking.current) return;
        asking.current = true;
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
                    setBase({ name: next.name, subject: next.subject, body: next.body_html });
                    setErrors({});
                    clear();
                }
                flash(setResetOk);
            },
        });
        asking.current = false;
    };

    // Unsaved edits ask before closing (X, Esc, click outside, Cancel).
    const guardClose = useDiscardGuard(!!template && dirty);
    const requestClose = () => guardClose(onClose);

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
    }, [template, dirty, saving, name, subject, body]);

    const announcement = savedOk ? t('email_saved') : sentOk ? t('email_sent') : resetOk ? t('email_reset_done') : '';

    return (
        <Dialog open={!!template} onOpenChange={(o) => !o && requestClose()}>
            <DialogContent
                onEscapeKeyDown={(e) => {
                    e.preventDefault();
                    // Esc with the HTML problem list open closes only the list.
                    if (document.querySelector('[role="dialog"] [data-radix-popper-content-wrapper]')) return;
                    requestClose();
                }}
                // A click outside asks to close; focus moving into a confirm does not.
                onPointerDownOutside={(e) => {
                    e.preventDefault();
                    requestClose();
                }}
                onFocusOutside={(e) => e.preventDefault()}
                className="flex h-[min(900px,90dvh)] w-[min(1500px,92vw)] max-w-[min(1500px,92vw)] flex-col gap-0 overflow-hidden rounded-2xl p-0"
            >
                {shown && (
                    <>
                        <FocusDialogHeader
                            icon={Mail}
                            eyebrow={
                                <span className="flex items-center gap-2">
                                    {shown.code}
                                    <span
                                        className={cn(
                                            'rounded-md px-1.5 py-0.5 text-xs font-semibold tracking-normal normal-case',
                                            CADENCE_META[shown.cadence].badge,
                                        )}
                                    >
                                        {t(CADENCE_META[shown.cadence].labelKey)}
                                    </span>
                                </span>
                            }
                            title={name || shown.name}
                            srDescription={t('email_edit_preview')}
                            subtitle={<TemplateAudienceLine templateKey={shown.key} />}
                            titleSuffix={
                                dirty ? (
                                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                                        <span className="bg-brand h-1.5 w-1.5 rounded-full" aria-hidden />
                                        {t('email_unsaved')}
                                    </span>
                                ) : undefined
                            }
                            headerRight={
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <div className="flex shrink-0 items-center gap-2 text-sm">
                                        <span className="text-muted-foreground" aria-hidden>
                                            {t('email_enabled')}
                                        </span>
                                        <DisabledReason reason={rights.toggle ? null : t('email_no_toggle_right')} label={t('email_enabled')}>
                                            <Switch
                                                checked={enabled}
                                                onChange={handleToggle}
                                                disabled={toggling || !rights.toggle}
                                                aria-label={t('email_enabled')}
                                            />
                                        </DisabledReason>
                                    </div>
                                    {/* Only once a person has reworded it */}
                                    {shown.updated_by_name && (
                                        <RecordStamps
                                            className="text-right"
                                            updatedAt={shown.updated_at}
                                            updatedBy={shown.updated_by_name}
                                            updatedByTh={shown.updated_by_name_th}
                                        />
                                    )}
                                </div>
                            }
                        />

                        {/* Body: preview left and form right on lg; stacked and scrolling as one below */}
                        <div className="border-border flex min-h-0 flex-1 flex-col overflow-y-auto border-t lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:overflow-hidden">
                            <div ref={formRef} className="flex shrink-0 flex-col gap-4 p-5 lg:min-h-0 lg:overflow-y-auto">
                                {hasErrors && <FormErrorBanner message={t('email_err_fix')} shakeKey={attempt} />}
                                {!rights.edit && <p className="text-muted-foreground text-xs">{t('email_no_edit_right')}</p>}
                                <Field label={t('email_template')} error={errors.name} required>
                                    <Input
                                        name="name"
                                        autoComplete="off"
                                        readOnly={!rights.edit}
                                        value={name}
                                        onChange={(e) => edit('name', setName)(e.target.value)}
                                    />
                                </Field>
                                <Field label={t('email_subject')} error={errors.subject} required>
                                    <SubjectField value={subject} onChange={edit('subject', setSubject)} readOnly={!rights.edit} />
                                </Field>
                                <Field label={t('email_body')} error={errors.body_html} required grow>
                                    <BodyEditor
                                        value={body}
                                        onChange={edit('body_html', setBody)}
                                        extraText={subject}
                                        variables={shown.variables}
                                        readOnly={!rights.edit}
                                    />
                                </Field>
                            </div>

                            <PreviewPane
                                brand={brand}
                                from={fromAddress}
                                subject={subject}
                                previewHtml={previewHtml}
                                rendering={rendering}
                                failed={failed}
                                onRetry={retry}
                            />
                        </div>

                        {/* Footer: test and reset left, cancel and save right */}
                        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
                            <span role="status" className="sr-only">
                                {announcement}
                            </span>
                            <div className="flex flex-wrap gap-2">
                                <DisabledReason reason={rights.test ? null : t('email_no_test_right')} label={t('email_test')}>
                                    <Button
                                        variant="outline"
                                        onClick={handleTest}
                                        disabled={testing || !rights.test}
                                        title={rights.test ? t('email_test_hint') : undefined}
                                    >
                                        {testing ? (
                                            <Loader2 className="animate-spin" aria-hidden />
                                        ) : sentOk ? (
                                            <Check className="animate-in zoom-in-50 fade-in duration-300" aria-hidden />
                                        ) : (
                                            <Send aria-hidden />
                                        )}
                                        {sentOk ? t('email_sent') : t('email_test')}
                                    </Button>
                                </DisabledReason>
                                {/* Off until the template differs from its standard; the note says why */}
                                {shown.is_standard && (
                                    <DisabledReason
                                        reason={!rights.reset ? t('email_no_reset_right') : shown.is_modified ? null : t('email_reset_unchanged')}
                                        label={t('email_reset')}
                                    >
                                        <Button
                                            variant="ghost"
                                            onClick={handleReset}
                                            disabled={resetting || !shown.is_modified || !rights.reset}
                                            title={shown.is_modified && rights.reset ? t('email_reset_hint') : undefined}
                                        >
                                            {resetting ? (
                                                <Loader2 className="animate-spin" aria-hidden />
                                            ) : resetOk ? (
                                                <Check className="animate-in zoom-in-50 fade-in duration-300" aria-hidden />
                                            ) : (
                                                <RotateCcw aria-hidden />
                                            )}
                                            {resetOk ? t('email_reset_done') : t('email_reset')}
                                        </Button>
                                    </DisabledReason>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={requestClose}>
                                    {t('cancel')}
                                </Button>
                                {rights.edit && (
                                    <SaveButton
                                        onClick={handleSave}
                                        loading={saving}
                                        success={savedOk}
                                        disabled={!dirty}
                                        title={t('email_save_hint')}
                                    >
                                        {t('email_save')}
                                    </SaveButton>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

// No create dialog: templates arrive with the code that sends them (App\Support\EmailTemplates).
