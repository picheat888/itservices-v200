import { useT } from '@/lang';
import { TicketCategoryIcon, TicketStatusBadge } from '@/modules/ticket';
import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { initials } from '@/shared/components/user-avatar';
import { formatDateTime } from '@/shared/lib/datetime';
import { isOnBehalfRequest, REQUEST_ONBOARDING_BADGE, REQUEST_STATUS_META, REQUEST_TYPE_META, requestTitle } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { Employee, EmployeeAccessRow, OrgChartNode } from '@/shared/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import {
    Briefcase,
    Building2,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Contact,
    Copy,
    Crown,
    Folder,
    Globe,
    Hash,
    House,
    Inbox,
    Laptop,
    LayoutDashboard,
    Mail,
    Package,
    Phone,
    Shield,
    ShieldCheck,
    SquarePen,
    Tag,
    Ticket,
    TriangleAlert,
    UserCheck,
    UserMinus,
    Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EmployeeHeldAsset, EmployeeRequestedTicket, EmployeeServiceRequest } from '../api/employeeApi';
import {
    useApprovalChain,
    useEmployee,
    useEmployeeAccess,
    useEmployeeAssets,
    useEmployeeRequests,
    useEmployeeTickets,
    useOrgChart,
} from '../hooks/use-employees';
import { deptColor } from '../lib/org-tree';

/** Whole-year + month tenure from a YYYY-MM-DD joined date. */
function tenureOf(joined?: string | null) {
    if (!joined) return { y: 0, m: 0 };
    const d = new Date(joined);
    if (isNaN(d.getTime())) return { y: 0, m: 0 };
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months -= 1;
    months = Math.max(0, months);
    return { y: Math.floor(months / 12), m: months % 12 };
}

export function EmployeeViewDrawer({
    employee,
    onClose,
    canEdit,
    isSuperViewer,
    canResetPassword,
    canResign,
    canCancelResign,
    canSetCredentials,
    onResign,
    onCancelResign,
    onResetPassword,
    onSetCredentials,
    onEdit,
    onViewProfile,
}: {
    employee: Employee | null;
    onClose: () => void;
    canEdit: boolean;
    isSuperViewer: boolean;
    canResetPassword: boolean;
    canResign: boolean;
    canCancelResign: boolean;
    canSetCredentials: boolean;
    onResign: (e: Employee) => void;
    onCancelResign: (e: Employee) => void;
    onResetPassword: (e: Employee) => void;
    onSetCredentials: (e: Employee) => void;
    onEdit: (e: Employee) => void;
    /** Open another person's profile (from the org explorer's "View profile"). */
    onViewProfile?: (employeeId: number) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const [tab, setTab] = useState<'overview' | 'org' | 'assets' | 'tickets' | 'requests' | 'access'>('overview');
    const [copied, setCopied] = useState<string | null>(null);
    // Retain the last employee so the content stays rendered while the dialog animates closed —
    // Radix skips the exit (fade-out) animation if the content unmounts the moment the prop goes null.
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);
    useEffect(() => {
        setTab('overview');
    }, [shown?.id]);

    // Every one of these is keyed to the employee on screen, so switching people
    // leaves them empty until their own data lands. `isLoading` is what tells the
    // tabs apart: "nothing yet" must not render as "this person has nothing" —
    // that reads as real information and it is wrong.
    const { data: approvalChain = [] } = useApprovalChain(shown?.id ?? null);
    const { data: orgNodes = [] } = useOrgChart();
    const { data: access, isLoading: accessLoading } = useEmployeeAccess(shown?.id ?? null);
    const { data: heldAssets = [], isLoading: assetsLoading } = useEmployeeAssets(shown?.id ?? null);
    const { data: requestedTickets = [], isLoading: ticketsLoading } = useEmployeeTickets(shown?.id ?? null);
    const { data: ownedRequests = [], isLoading: requestsLoading } = useEmployeeRequests(shown?.id ?? null);
    // Live copy of the employee — refetched when mutations invalidate ['employee'], so
    // setting credentials reflects immediately (No-account badge/strip clears without reload).
    const { data: liveEmp } = useEmployee(shown?.id ?? null);

    const nodeById = useMemo(() => new Map(orgNodes.map((n) => [n.id, n])), [orgNodes]);
    const directReports = useMemo(() => (shown ? orgNodes.filter((n) => n.manager_id === shown.id) : []), [orgNodes, shown]);

    if (!shown) return null;

    // The live copy only wins when it is the same person the drawer is showing — the id
    // check is what stops a previous employee's freshly-fetched record from being drawn
    // under this one's name.
    const emp = liveEmp && liveEmp.id === shown.id ? liveEmp : shown;
    const name = lang === 'th' ? (emp.name_th ?? emp.name) : emp.name;
    const altName = lang === 'th' ? emp.name : emp.name_th;
    const resigned = emp.status === 'resigned';
    const tenure = tenureOf(emp.joined_at);
    // The person this employee reports to (their manager), resolved from the org list.
    const managerNode = emp.manager_id ? nodeById.get(emp.manager_id) : null;
    const managerName = managerNode ? (lang === 'th' ? (managerNode.name_th ?? managerNode.name) : managerNode.name) : null;

    const accentCode = nodeById.get(emp.id)?.department_code ?? null;
    // The header/chrome is neutral. The brand colour is kept ONLY for the active tab
    // indicator and the Edit button; department colours live ONLY in the Organization tab.
    const accent = 'var(--brand)';

    const showCredentials = canSetCredentials && !emp.has_account && !resigned;

    const copy = (txt: string, key: string) => {
        try {
            navigator.clipboard?.writeText(txt);
        } catch {
            /* clipboard may be unavailable */
        }
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    // Access is shown read-only here — granting/revoking is managed in the Access Directory.
    const accessGroups = [
        { key: 'email_groups' as const, label: t('emp_v_email_groups'), icon: <Mail className="h-3.5 w-3.5" /> },
        { key: 'file_shares' as const, label: t('emp_v_file_shares'), icon: <Folder className="h-3.5 w-3.5" /> },
        { key: 'social' as const, label: t('emp_v_social'), icon: <Globe className="h-3.5 w-3.5" /> },
        { key: 'software' as const, label: t('access_software'), icon: <Package className="h-3.5 w-3.5" /> },
    ];

    // Right-side role/level pill per group (English, matching the Access Directory badges):
    // Email groups → Owner / Member · File shares → Owner / Read-Write / Read · others → none.
    const rolePill = (key: string, r: EmployeeAccessRow): { label: string; cls: string } | null => {
        const owner = { label: 'Owner', cls: 'bg-brand/15 text-brand' };
        const muted = 'bg-muted text-muted-foreground';
        if (key === 'email_groups') return r.is_owner ? owner : { label: 'Member', cls: muted };
        if (key === 'file_shares') {
            if (r.is_owner) return owner;
            if (r.access_level === 'Write') return { label: 'Read/Write', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' };
            if (r.access_level) return { label: r.access_level, cls: muted };
        }
        return null;
    };

    // Leading tile per row: social/software show their uploaded logo when present, otherwise the
    // resource's initial (tinted with its own colour when it has one); email groups / file shares
    // show the group icon on a brand tint.
    const leadingTile = (key: string, r: EmployeeAccessRow) => {
        if (r.resource_logo) {
            return <img src={r.resource_logo} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />;
        }
        const color = r.resource_color ?? null;
        const style = color ? { background: `${color}22`, color } : undefined;
        const brandTint = color ? '' : 'bg-brand/15 text-brand';
        const content =
            key === 'email_groups' ? (
                <Mail className="h-4 w-4" />
            ) : key === 'file_shares' ? (
                <Folder className="h-4 w-4" />
            ) : (
                <span className="text-[12px] font-bold">{(r.resource_name?.trim()[0] ?? '?').toUpperCase()}</span>
            );
        return (
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', brandTint)} style={style}>
                {content}
            </span>
        );
    };

    // ── Sub-components ──
    const RailRow = ({
        icon,
        label,
        value,
        mono,
        copyKey,
    }: {
        icon: React.ReactNode;
        label: string;
        value?: string | null;
        mono?: boolean;
        copyKey?: string;
    }) => (
        <div className="group flex items-start gap-2.5">
            <div className="bg-muted text-muted-foreground grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg">{icon}</div>
            <div className="min-w-0 flex-1">
                <div className="text-muted-foreground text-[10.5px] font-medium tracking-wide uppercase">{label}</div>
                <div className={cn('mt-0.5 text-[13px] leading-snug font-medium break-words', mono && 'font-mono text-xs')}>{value || '—'}</div>
            </div>
            {copyKey && value && (
                <button
                    type="button"
                    onClick={() => copy(value, copyKey)}
                    className={cn(
                        'hover:bg-accent grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-0 transition group-hover:opacity-100',
                        copied === copyKey && 'text-emerald-600 opacity-100 dark:text-emerald-400',
                    )}
                    title={t('emp_v_copy')}
                >
                    {copied === copyKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            )}
        </div>
    );

    const Kpi = ({ val, lbl, warn }: { val: React.ReactNode; lbl: string; warn?: boolean }) => (
        <div className="flex min-w-[46px] flex-col items-center px-2.5">
            <div className={cn('text-[16px] leading-none font-extrabold tracking-tight tabular-nums', warn && 'text-amber-500')}>{val}</div>
            <div className="text-muted-foreground mt-1 text-[9px] font-semibold tracking-wide whitespace-nowrap uppercase">{lbl}</div>
        </div>
    );

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex h-[88vh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogTitle className="sr-only">{name}</DialogTitle>

                {/* ── COVER ── (neutral chrome — no brand tint here) */}
                <div
                    className="border-border flex shrink-0 items-center gap-5 border-b px-7 pt-6 pb-5"
                    style={{ background: 'radial-gradient(120% 160% at 0% 0%, var(--accent) 0%, var(--card) 60%)' }}
                >
                    {/* Avatar — minimal: soft offset ring, gentle float shadow, monochrome fallback. */}
                    <Avatar className="ring-card h-[72px] w-[72px] shrink-0 rounded-full shadow-md ring-2">
                        {emp.photo_url && <AvatarImage src={emp.photo_url} alt="" className="rounded-full object-cover" />}
                        <AvatarFallback
                            className="text-muted-foreground rounded-full text-2xl font-semibold tracking-tight"
                            style={{ background: 'linear-gradient(135deg, var(--muted), color-mix(in oklch, var(--foreground) 8%, var(--muted)))' }}
                        >
                            {initials(emp.name || '?')}
                        </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2.5">
                            <h2 className="text-xl leading-tight font-extrabold tracking-tight">{name}</h2>
                            {resigned ? (
                                <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold">
                                    {t('resigned')}
                                </span>
                            ) : (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {t('active')}
                                </span>
                            )}
                            {emp.is_super_admin && (
                                <span className="bg-brand/10 text-brand inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                                    <Crown className="h-3 w-3" />
                                    {t('emp_super_admin')}
                                </span>
                            )}
                            {/* Login-account state as a badge alongside Status. */}
                            {emp.has_account ? (
                                <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                                    <ShieldCheck className="text-brand h-3 w-3" />
                                    {t('emp_v_has_account')}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    <TriangleAlert className="h-3 w-3" />
                                    {t('emp_v_no_account')}
                                </span>
                            )}
                        </div>
                        {altName && <div className="text-muted-foreground mb-2.5 text-[13px]">{altName}</div>}
                        <div className="flex flex-wrap gap-1.5">
                            <span className="bg-muted border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium">
                                <Hash className="text-muted-foreground h-3 w-3" />
                                {emp.code}
                            </span>
                            <span className="bg-muted border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                                <Briefcase className="text-muted-foreground h-3 w-3" />
                                {emp.position || '—'}
                            </span>
                            <span className="bg-muted border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                                <Building2 className="text-muted-foreground h-3 w-3" />
                                {lang === 'th' ? (emp.department_th ?? emp.department) : emp.department}
                            </span>
                        </div>
                    </div>

                    {/* KPI strip */}
                    <div className="border-border bg-card hidden shrink-0 items-center rounded-xl border px-2.5 py-2 shadow-sm sm:flex">
                        <Kpi
                            val={
                                <>
                                    {tenure.y}
                                    <small className="text-muted-foreground ml-0.5 text-[11px] font-semibold">{t('emp_v_yr')}</small>
                                </>
                            }
                            lbl={t('emp_v_tenure')}
                        />
                        <div className="bg-border h-7 w-px" />
                        <Kpi val={directReports.length} lbl={t('emp_v_reports')} />
                        <div className="bg-border h-7 w-px" />
                        <Kpi val={approvalChain.length} lbl={t('emp_v_approval')} />
                    </div>
                </div>

                {/* ── RESIGN STRIP ── */}
                {resigned && (
                    <div className="bg-destructive/10 text-destructive border-border flex shrink-0 items-center gap-2 border-b px-7 py-2 text-[12.5px] font-medium">
                        <TriangleAlert className="h-[15px] w-[15px] shrink-0" />
                        <span>{t('emp_v_resigned_note')}</span>
                        {emp.last_day && (
                            <span className="font-mono">
                                · {t('emp_v_last_day')} {emp.last_day}
                            </span>
                        )}
                        {emp.resign_reason && <span>· {emp.resign_reason}</span>}
                    </div>
                )}

                {/* ── NO-ACCOUNT STRIP ── shown only while the employee still has no username/password */}
                {showCredentials && (
                    <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-7 py-2.5 dark:border-amber-800 dark:bg-amber-950/20">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                            <span className="text-[12px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                                {t('cred_no_account')}
                            </span>
                            <span className="text-muted-foreground ml-2 text-xs">{t('cred_no_account_desc')}</span>
                        </div>
                        <Button size="sm" className="shrink-0" onClick={() => onSetCredentials(emp)}>
                            <ShieldCheck className="h-4 w-4" />
                            {t('emp_set_credentials')}
                        </Button>
                    </div>
                )}

                {/* ── BODY ── */}
                <div className="flex min-h-0 flex-1">
                    {/* RAIL */}
                    <aside className="border-border flex w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-r p-5">
                        <section className="flex flex-col gap-3">
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_v_contact')}
                            </div>
                            <RailRow icon={<Mail className="h-3.5 w-3.5" />} label={t('emp_email')} value={emp.email} copyKey="email" />
                            <RailRow icon={<Phone className="h-3.5 w-3.5" />} label={t('emp_phone')} value={emp.phone} copyKey="phone" mono />
                        </section>

                        {/* Login credentials — the username only; passwords are never surfaced here. */}
                        <section className="flex flex-col gap-3">
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_v_credentials')}
                            </div>
                            <RailRow icon={<Shield className="h-3.5 w-3.5" />} label={t('emp_username')} value={emp.username} copyKey="user" mono />
                        </section>

                        <section className="flex flex-col gap-3">
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_v_employment')}
                            </div>
                            <RailRow
                                icon={<Users className="h-3.5 w-3.5" />}
                                label={t('emp_section')}
                                value={lang === 'th' ? (emp.section_th ?? emp.section) : emp.section}
                            />
                            <RailRow
                                icon={<Building2 className="h-3.5 w-3.5" />}
                                label={t('department')}
                                value={lang === 'th' ? (emp.department_th ?? emp.department) : emp.department}
                            />
                            <RailRow icon={<Briefcase className="h-3.5 w-3.5" />} label={t('position')} value={emp.position} />
                            <RailRow icon={<UserCheck className="h-3.5 w-3.5" />} label={t('emp_manager')} value={managerName} />
                            <RailRow icon={<Clock className="h-3.5 w-3.5" />} label={t('joined')} value={emp.joined_at} mono />
                        </section>
                    </aside>

                    {/* MAIN */}
                    <div className="flex min-w-0 flex-1 flex-col">
                        {/* Tabs */}
                        <div className="border-border flex shrink-0 gap-1 border-b px-4 pt-2.5">
                            {[
                                {
                                    id: 'overview' as const,
                                    label: t('nav_overview'),
                                    icon: <LayoutDashboard className="h-[15px] w-[15px]" />,
                                    count: undefined as number | undefined,
                                    soon: false,
                                },
                                {
                                    id: 'org' as const,
                                    label: t('emp_v_tab_org'),
                                    icon: <Users className="h-[15px] w-[15px]" />,
                                    count: undefined,
                                    soon: false,
                                },
                                {
                                    id: 'assets' as const,
                                    label: t('emp_v_tab_assets'),
                                    icon: <Laptop className="h-[15px] w-[15px]" />,
                                    // No number until this person's own count is known — a 0 that
                                    // turns into 3 a moment later was never a count.
                                    count: assetsLoading ? undefined : heldAssets.length,
                                    soon: false,
                                },
                                {
                                    id: 'tickets' as const,
                                    label: t('emp_v_tab_tickets'),
                                    icon: <Ticket className="h-[15px] w-[15px]" />,
                                    count: ticketsLoading ? undefined : requestedTickets.length,
                                    soon: false,
                                },
                                {
                                    id: 'requests' as const,
                                    label: t('requests'),
                                    icon: <Inbox className="h-[15px] w-[15px]" />,
                                    count: requestsLoading ? undefined : ownedRequests.length,
                                    soon: false,
                                },
                                {
                                    id: 'access' as const,
                                    label: t('emp_v_tab_access'),
                                    icon: <Shield className="h-[15px] w-[15px]" />,
                                    count: access
                                        ? access.email_groups.length + access.file_shares.length + access.social.length + access.software.length
                                        : undefined,
                                    soon: false,
                                },
                            ].map((tb) => (
                                <button
                                    key={tb.id}
                                    onClick={() => setTab(tb.id)}
                                    className={cn(
                                        'relative inline-flex items-center gap-1.5 rounded-t-lg px-3 pt-2 pb-3 text-[12.5px] font-semibold transition-colors',
                                        tab === tb.id ? '' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                    )}
                                    style={tab === tb.id ? { color: accent } : {}}
                                >
                                    {tb.icon}
                                    {tb.label}
                                    {tb.count != null && tb.count > 0 && (
                                        <span className="bg-muted text-muted-foreground inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-bold">
                                            {tb.count}
                                        </span>
                                    )}
                                    {tb.soon && (
                                        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-amber-600 uppercase dark:text-amber-400">
                                            {t('emp_v_soon')}
                                        </span>
                                    )}
                                    {tab === tb.id && (
                                        <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded" style={{ background: accent }} />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Pane — the Organization tab fills the whole area (no padding/scroll
                            here; OrgPane manages its own layout + single scroll). */}
                        <div
                            className={cn(
                                'min-h-0 flex-1',
                                tab === 'org' ? 'flex flex-col' : tab === 'assets' || tab === 'tickets' ? 'flex flex-col p-5' : 'overflow-y-auto p-5',
                            )}
                        >
                            {tab === 'overview' && (
                                <OverviewPane emp={emp} tenure={tenure} reports={directReports.length} steps={approvalChain.length} />
                            )}
                            {tab === 'org' && (
                                <OrgPane
                                    orgNodes={orgNodes}
                                    nodeById={nodeById}
                                    rootFocus={{ id: emp.id, name: emp.name, nameTh: emp.name_th, title: emp.position, deptCode: accentCode }}
                                    onViewProfile={onViewProfile}
                                />
                            )}
                            {tab === 'access' && (
                                <div className="space-y-4">
                                    {/* Every group renders nothing while this person's access is
                                        loading, which looked exactly like "no access at all".
                                        Placeholder rows say which of the two it is. */}
                                    {accessLoading && (
                                        <div className="space-y-2" aria-busy="true">
                                            {Array.from({ length: 4 }).map((_, i) => (
                                                <div key={i} className="space-y-1">
                                                    <div className="bg-muted h-3 w-28 animate-pulse rounded" />
                                                    <div className="border-border bg-card h-10 animate-pulse rounded-lg border" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {access?.outstanding && (
                                        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
                                            <TriangleAlert className="h-4 w-4 shrink-0" />
                                            <span className="flex-1">{t('emp_v_access_outstanding')}</span>
                                        </div>
                                    )}
                                    {accessGroups.map((grp) => {
                                        // Owners float to the top of each group; within each tier sort by name (A–Z).
                                        const rows = [...(access?.[grp.key] ?? [])].sort(
                                            (a, b) =>
                                                Number(!!b.is_owner) - Number(!!a.is_owner) ||
                                                (a.resource_name ?? '').localeCompare(b.resource_name ?? ''),
                                        );
                                        if (rows.length === 0) return null;
                                        return (
                                            <div key={grp.key} className="space-y-1">
                                                <div className="text-muted-foreground flex items-center gap-2 text-[12.5px] font-bold">
                                                    {grp.icon}
                                                    {grp.label}
                                                    <span className="bg-muted inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-bold">
                                                        {rows.length}
                                                    </span>
                                                </div>
                                                {rows.map((r) => {
                                                    const pill = rolePill(grp.key, r);
                                                    return (
                                                        <div
                                                            key={r.id}
                                                            className="border-border bg-card flex items-center gap-3 rounded-lg border px-3 py-1.5"
                                                        >
                                                            {leadingTile(grp.key, r)}
                                                            {grp.key === 'software' ? (
                                                                // Software reads as a single "Brand + Name" line (brand comes via resource_detail).
                                                                <div className="min-w-0 flex-1 truncate text-[13px] leading-tight">
                                                                    {/* Brand bold, software name in regular weight. */}
                                                                    {r.resource_detail && <span className="font-bold">{r.resource_detail} </span>}
                                                                    {r.resource_name}
                                                                </div>
                                                            ) : grp.key === 'social' ? (
                                                                // Single line: platform name is the label; the URL reads as technical, so it's
                                                                // set in mono (like the paths/emails elsewhere) and split off with a middot.
                                                                <div className="min-w-0 flex-1 truncate text-[13px] leading-tight">
                                                                    <span className="font-semibold">{r.resource_name}</span>
                                                                    {r.resource_detail && (
                                                                        <span className="text-muted-foreground font-mono text-[11px]">
                                                                            {' '}
                                                                            · {r.resource_detail}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-[13px] leading-tight font-medium">
                                                                        {r.resource_name}
                                                                    </div>
                                                                    <div className="text-muted-foreground truncate font-mono text-[11px] leading-tight">
                                                                        {r.resource_detail ?? r.resource_code}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {pill && (
                                                                <span
                                                                    className={cn(
                                                                        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
                                                                        pill.cls,
                                                                    )}
                                                                >
                                                                    {pill.label}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                    {access &&
                                        access.email_groups.length + access.file_shares.length + access.social.length + access.software.length ===
                                            0 && <div className="text-muted-foreground py-12 text-center text-sm">{t('emp_v_no_access')}</div>}
                                </div>
                            )}
                            {tab === 'assets' && <AssetsPane assets={heldAssets} lang={lang} loading={assetsLoading} />}
                            {tab === 'tickets' && <TicketsPane tickets={requestedTickets} loading={ticketsLoading} />}
                            {tab === 'requests' && <RequestsPane requests={ownedRequests} loading={requestsLoading} />}
                        </div>
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div className="border-border bg-card flex shrink-0 items-center justify-between gap-2.5 border-t px-5 py-3">
                    {/* Cancel sits on the left. */}
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    {/* Account actions (moved out of the rail) sit beside Edit on the right. */}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {(canResetPassword || canSetCredentials) && emp.has_account && (
                            <Button variant="outline" onClick={() => onResetPassword(emp)}>
                                <ShieldCheck className="h-4 w-4" />
                                {t('emp_cred_manage_title')}
                            </Button>
                        )}
                        {canResign && !resigned && (
                            <Button variant="outline" className="text-destructive" onClick={() => onResign(emp)}>
                                <UserMinus className="h-4 w-4" />
                                {t('resign_employee')}
                            </Button>
                        )}
                        {canCancelResign && resigned && (
                            <Button variant="outline" className="text-emerald-600 dark:text-emerald-400" onClick={() => onCancelResign(emp)}>
                                <UserCheck className="h-4 w-4" />
                                {t('cancel_resign')}
                            </Button>
                        )}
                        {canEdit && !resigned && (
                            <Button
                                onClick={() => onEdit(emp)}
                                disabled={emp.is_super_admin && !isSuperViewer}
                                title={emp.is_super_admin && !isSuperViewer ? t('emp_admin_protected') : undefined}
                                style={{ background: accent, borderColor: accent }}
                            >
                                <SquarePen className="h-4 w-4" />
                                {t('edit')}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Status → dot colour + i18n label key for the read-only held-assets table. */
const HELD_STATUS_META: Record<string, { dot: string; key: string }> = {
    deployed: { dot: 'bg-emerald-500', key: 'emp_v_st_deployed' },
    pending_acceptance: { dot: 'bg-amber-500', key: 'emp_v_st_pending_acceptance' },
    pending_return: { dot: 'bg-amber-500', key: 'emp_v_st_pending_return' },
    ready: { dot: 'bg-emerald-500', key: 'emp_v_st_ready' },
    writeoff: { dot: 'bg-red-500', key: 'emp_v_st_writeoff' },
};

/**
 * Assets tab — a read-only table of what the employee currently holds (own-module data).
 * Reuses the shared DataTable (same Prev/Next pager as the asset History tab), 6 rows per page.
 */
function AssetsPane({ assets, lang, loading }: { assets: EmployeeHeldAsset[]; lang: string; loading?: boolean }) {
    const t = useT();
    // Empty only counts once this person's list has actually arrived; while it is on
    // its way the table shows its own loading rows (below).
    if (assets.length === 0 && !loading) {
        return (
            <div className="text-muted-foreground flex min-h-[220px] flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="bg-muted text-muted-foreground grid h-14 w-14 place-items-center rounded-2xl">
                    <Laptop className="h-6 w-6" />
                </div>
                <div className="text-sm">{t('emp_v_no_assets')}</div>
            </div>
        );
    }

    const columns: Column<EmployeeHeldAsset>[] = [
        {
            key: 'device',
            header: t('emp_v_col_device'),
            render: (a) => {
                const meta = HELD_STATUS_META[a.status] ?? null;
                const type = (lang === 'th' ? (a.type_th ?? a.type) : a.type) ?? '—';
                return (
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="bg-accent text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <Laptop className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-xs font-medium">{a.model ?? a.asset_code}</div>
                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
                                <span className={cn('h-1.5 w-1.5 rounded-full', meta?.dot ?? 'bg-muted-foreground')} />
                                {type} · {meta ? t(meta.key) : a.status}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: 'tag',
            header: 'Tag',
            render: (a) =>
                a.tag ? (
                    <span className="bg-brand/10 text-brand inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                        <Tag className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate">{a.tag}</span>
                    </span>
                ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                ),
        },
        {
            key: 'serial',
            header: 'Serial',
            render: (a) => <span className="text-foreground font-mono text-xs">{a.serial ?? a.asset_code}</span>,
        },
        {
            key: 'received',
            header: t('emp_v_col_received'),
            render: (a) => <span className="text-muted-foreground text-xs font-semibold">{a.owned_since ?? '—'}</span>,
        },
    ];

    // Same compact treatment as the Tickets tab: fillHeight sizes rows to the pane and the
    // wrapper tightens the density token so both tabs read as one table style.
    return (
        <div className="flex min-h-0 flex-1 flex-col [--row-py:0.375rem]">
            <DataTable fillHeight rowHeight={48} columns={columns} rows={assets} rowKey={(a) => a.id} loading={loading} />
        </div>
    );
}

/**
 * Tickets tab — a read-only table of the tickets this employee has requested (own-module data).
 * Reuses the shared DataTable and the ticket module's status/priority badges via its barrel.
 */
function TicketsPane({ tickets, loading }: { tickets: EmployeeRequestedTicket[]; loading?: boolean }) {
    const t = useT();
    if (tickets.length === 0 && !loading) {
        return (
            <div className="text-muted-foreground flex min-h-[220px] flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="bg-muted text-muted-foreground grid h-14 w-14 place-items-center rounded-2xl">
                    <Ticket className="h-6 w-6" />
                </div>
                <div className="text-sm">{t('emp_v_no_tickets')}</div>
            </div>
        );
    }

    const columns: Column<EmployeeRequestedTicket>[] = [
        {
            key: 'requested',
            header: t('ticket_request_at'),
            className: 'w-[14%]',
            render: (tk) => <span className="text-muted-foreground text-xs font-semibold whitespace-nowrap">{formatDateTime(tk.created_at)}</span>,
        },
        {
            key: 'subject',
            header: t('ticket_subject'),
            // max-w-0 stops the no-wrap truncate text from stretching the column past its
            // 50% share (auto table layout sizes columns by content otherwise).
            className: 'w-[50%] max-w-0',
            // Two-line cell: subject on top, ticket number underneath.
            render: (tk) => (
                <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{tk.subject}</div>
                    <div className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">{tk.ticket_no}</div>
                </div>
            ),
        },
        {
            key: 'category',
            header: t('ticket_category'),
            className: 'w-[16%]',
            render: (tk) => (
                <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                    <TicketCategoryIcon category={tk.category} className="h-3.5 w-3.5" />
                    {t(`ticket_cat_${tk.category}`)}
                </span>
            ),
        },
        {
            key: 'status',
            header: t('status'),
            className: 'w-[20%]',
            render: (tk) => <TicketStatusBadge status={tk.status} t={t} />,
        },
    ];

    // fillHeight sizes rows-per-page to the pane's real height, so the tab never scrolls
    // on any screen — extra tickets flow to the pager. The wrapper keeps the height chain
    // intact (flex-1/min-h-0) and tightens the density token so compact rows fit more.
    return (
        <div className="flex min-h-0 flex-1 flex-col [--row-py:0.375rem]">
            <DataTable fillHeight rowHeight={44} columns={columns} rows={tickets} rowKey={(tk) => tk.id} loading={loading} />
        </div>
    );
}

/**
 * Requests tab — a read-only table of the service requests this employee owns, whether they
 * filed them or HR filed them on their behalf on day one (own-module data, gated by
 * employees.view). Rows are not clickable: opening one would need the Request module's own
 * permission, which a reader of this drawer is not required to hold.
 */
function RequestsPane({ requests, loading }: { requests: EmployeeServiceRequest[]; loading?: boolean }) {
    const t = useT();
    if (requests.length === 0 && !loading) {
        return (
            <div className="text-muted-foreground flex min-h-[220px] flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="bg-muted text-muted-foreground grid h-14 w-14 place-items-center rounded-2xl">
                    <Inbox className="h-6 w-6" />
                </div>
                <div className="text-sm">{t('emp_v_no_requests')}</div>
            </div>
        );
    }

    const columns: Column<EmployeeServiceRequest>[] = [
        {
            key: 'submitted',
            header: t('req_col_submitted'),
            className: 'w-[14%]',
            render: (r) => <span className="text-muted-foreground text-xs font-semibold whitespace-nowrap">{formatDateTime(r.created_at)}</span>,
        },
        {
            key: 'title',
            // max-w-0 keeps the truncating cell inside its share of the table (see TicketsPane).
            className: 'w-[50%] max-w-0',
            header: t('req_col_title'),
            // The service name is written in the reader's language, never the filer's; the
            // reference underneath is what both of them would quote to each other.
            render: (r) => (
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-xs font-medium">{requestTitle(r, t)}</span>
                        {isOnBehalfRequest(r) && (
                            <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} dot={false} className="shrink-0">
                                {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                            </StatusBadge>
                        )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">{r.reference}</div>
                </div>
            ),
        },
        {
            key: 'type',
            header: t('req_col_type'),
            className: 'w-[16%]',
            render: (r) => {
                const meta = REQUEST_TYPE_META[r.type];
                const Icon = meta.icon;
                return (
                    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                        {t(meta.labelKey)}
                    </span>
                );
            },
        },
        {
            key: 'status',
            header: t('req_col_status'),
            className: 'w-[20%]',
            render: (r) => <StatusBadge tone={REQUEST_STATUS_META[r.status].tone}>{t(REQUEST_STATUS_META[r.status].labelKey)}</StatusBadge>,
        },
    ];

    // Same sizing as the Tickets tab so the two read as one table style.
    return (
        <div className="flex min-h-0 flex-1 flex-col [--row-py:0.375rem]">
            <DataTable fillHeight rowHeight={44} columns={columns} rows={requests} rowKey={(r) => r.id} loading={loading} />
        </div>
    );
}

/** Overview tab — summary cards. */
function OverviewPane({ emp, tenure, reports, steps }: { emp: Employee; tenure: { y: number; m: number }; reports: number; steps: number }) {
    const t = useT();
    const cards = [
        {
            icon: <Clock className="h-[17px] w-[17px]" />,
            val: `${tenure.y}${t('emp_v_y')} ${tenure.m}${t('emp_v_m')}`,
            lbl: t('emp_v_tenure'),
        },
        { icon: <Users className="h-[17px] w-[17px]" />, val: reports, lbl: t('emp_v_direct_reports') },
        { icon: <Crown className="h-[17px] w-[17px]" />, val: steps, lbl: t('emp_v_approval_steps') },
        { icon: <ShieldCheck className="h-[17px] w-[17px]" />, val: emp.has_account ? '✓' : '—', lbl: t('emp_v_account') },
    ];
    return (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {cards.map((c, i) => (
                <div
                    key={i}
                    className="border-border bg-muted/40 hover:border-border flex items-center gap-3 rounded-xl border p-3.5 transition hover:shadow-sm"
                >
                    <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                        style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
                    >
                        {c.icon}
                    </div>
                    <div className="min-w-0">
                        <div className="text-xl leading-none font-extrabold tracking-tight tabular-nums">{c.val}</div>
                        <div className="text-muted-foreground mt-1 text-[10.5px] font-semibold tracking-wide uppercase">{c.lbl}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * Organization tab — a Microsoft Teams-style org explorer. Shows the focused person's
 * manager chain (above), the person, and their direct reports. Clicking any manager or
 * report "walks" the view to that person. A Home | Back | Next control (top-left of the
 * framed area) navigates the browse history.
 */
function OrgPane({
    orgNodes,
    nodeById,
    rootFocus,
    onViewProfile,
}: {
    orgNodes: OrgChartNode[];
    nodeById: Map<number, OrgChartNode>;
    rootFocus: { id: number; name: string; nameTh?: string | null; title?: string | null; deptCode?: string | null };
    onViewProfile?: (employeeId: number) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    // How many managers above the focus to show before collapsing the rest into a
    // "Show N more" pill, and how many direct reports before a "Show N more" button.
    const VISIBLE_MANAGERS = 2;
    const VISIBLE_REPORTS = 6;

    // Browse history (like a browser): history[ptr] is the person on screen.
    // index 0 is always the employee the dialog was opened for (Home target).
    const [history, setHistory] = useState<number[]>([rootFocus.id]);
    const [ptr, setPtr] = useState(0);
    const [managersExpanded, setManagersExpanded] = useState(false);
    const [reportsExpanded, setReportsExpanded] = useState(false);
    useEffect(() => {
        setHistory([rootFocus.id]);
        setPtr(0);
    }, [rootFocus.id]);

    const focusId = history[ptr];
    const canBack = ptr > 0;
    const canNext = ptr < history.length - 1;
    const canHome = focusId !== rootFocus.id;

    // Collapse the expand toggles whenever the focused person changes.
    useEffect(() => {
        setManagersExpanded(false);
        setReportsExpanded(false);
    }, [focusId]);

    // Navigate to a new person → truncate any forward history and push.
    const navTo = (id: number) => {
        if (id === focusId) return;
        setHistory((h) => [...h.slice(0, ptr + 1), id]);
        setPtr((p) => p + 1);
    };
    const goHome = () => setPtr(0);
    const goBack = () => setPtr((p) => Math.max(0, p - 1));
    const goNext = () => setPtr((p) => Math.min(history.length - 1, p + 1));

    // Children index → direct reports + total-subtree size for any node.
    const childrenOf = useMemo(() => {
        const m = new Map<number, OrgChartNode[]>();
        for (const n of orgNodes) {
            if (n.manager_id == null) continue;
            const arr = m.get(n.manager_id);
            if (arr) arr.push(n);
            else m.set(n.manager_id, [n]);
        }
        return m;
    }, [orgNodes]);

    // Total people anywhere below a node (all levels), used for the 👥 badge.
    const totalReports = (id: number) => {
        let count = 0;
        const seen = new Set<number>();
        const stack = [...(childrenOf.get(id) ?? [])];
        while (stack.length) {
            const n = stack.pop()!;
            if (seen.has(n.id)) continue;
            seen.add(n.id);
            count++;
            const ch = childrenOf.get(n.id);
            if (ch) stack.push(...ch);
        }
        return count;
    };
    const directCount = (id: number) => childrenOf.get(id)?.length ?? 0;

    // Synthetic node for the focus, falling back to rootFocus when not in the org list.
    const focusNode: OrgChartNode = nodeById.get(focusId) ?? {
        id: rootFocus.id,
        code: '',
        name: rootFocus.name,
        name_th: rootFocus.nameTh ?? null,
        title: rootFocus.title ?? null,
        department: null,
        department_code: rootFocus.deptCode ?? null,
        photo_url: null,
        manager_id: null,
        reports_count: 0,
    };

    // Manager chain above the focus, top → direct-manager.
    const chainTopDown = useMemo(() => {
        const chain: OrgChartNode[] = [];
        const seen = new Set<number>();
        let cur = nodeById.get(focusId)?.manager_id ?? null;
        while (cur != null && nodeById.has(cur) && !seen.has(cur)) {
            seen.add(cur);
            chain.push(nodeById.get(cur)!);
            cur = nodeById.get(cur)?.manager_id ?? null;
        }
        return chain.reverse();
    }, [focusId, nodeById]);

    const directReports = useMemo(() => childrenOf.get(focusId) ?? [], [childrenOf, focusId]);

    const hiddenManagers = chainTopDown.slice(0, Math.max(0, chainTopDown.length - VISIBLE_MANAGERS));
    const shownManagers = managersExpanded ? chainTopDown : chainTopDown.slice(Math.max(0, chainTopDown.length - VISIBLE_MANAGERS));
    const shownReports = reportsExpanded ? directReports : directReports.slice(0, VISIBLE_REPORTS);
    const hiddenReportsCount = directReports.length - shownReports.length;

    const nameOf = (n: { name: string; name_th?: string | null }) => (lang === 'th' ? (n.name_th ?? n.name) : n.name);

    // ── Small building blocks ──
    const NavBtn = ({
        onClick,
        disabled,
        title,
        children,
    }: {
        onClick: () => void;
        disabled?: boolean;
        title: string;
        children: React.ReactNode;
    }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="border-border bg-card text-foreground hover:bg-accent grid h-7 w-7 place-items-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );

    const NodeAvatar = ({ node, size }: { node: OrgChartNode; size: number }) => {
        const dc = deptColor(node.department_code);
        return (
            <div
                className="shrink-0 overflow-hidden rounded-full"
                style={{ width: size, height: size, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.18)' }}
            >
                {node.photo_url ? (
                    <img src={node.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="grid h-full w-full place-items-center font-bold text-white" style={{ background: dc, fontSize: size * 0.36 }}>
                        {initials(node.name || '?')}
                    </div>
                )}
            </div>
        );
    };

    const Connector = () => <div className="bg-border mx-auto h-3 w-px" />;

    // Full-width card for a manager / direct report (clickable to walk the view).
    const NodeCard = ({ node }: { node: OrgChartNode }) => {
        const total = totalReports(node.id);
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => navTo(node.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), navTo(node.id))}
                className="border-border bg-card focus-visible:ring-brand relative flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg border py-1.5 pr-2.5 pl-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2"
            >
                <NodeAvatar node={node} size={32} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] leading-tight font-bold">{nameOf(node)}</div>
                    <div className="text-muted-foreground truncate text-[11px]">{node.title || '—'}</div>
                </div>
                {total > 0 && (
                    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
                        <Users className="h-3 w-3" />
                        {total}
                    </span>
                )}
            </div>
        );
    };

    const dc = deptColor(focusNode.department_code);

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Navigation bar (top-left controls + current person) — flush at the top of the tab */}
            <div className="border-border bg-card/40 flex shrink-0 items-center gap-1.5 border-b px-4 py-2.5">
                <NavBtn onClick={goHome} disabled={!canHome} title={t('emp_v_home')}>
                    <House className="h-3.5 w-3.5" />
                </NavBtn>
                <NavBtn onClick={goBack} disabled={!canBack} title={t('back')}>
                    <ChevronLeft className="h-4 w-4" />
                </NavBtn>
                <NavBtn onClick={goNext} disabled={!canNext} title={t('next')}>
                    <ChevronRight className="h-4 w-4" />
                </NavBtn>
                <div className="text-muted-foreground ml-2 min-w-0 truncate text-xs">
                    <span className="text-foreground font-medium">{t('emp_v_viewing')}:</span> {nameOf(focusNode)}
                </div>
            </div>

            {/* Diagram — fills the remaining height and is the single scroll container */}
            <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="mx-auto flex w-full max-w-[460px] flex-col">
                    {/* Collapsed managers → "Show N more" pill with an avatar stack */}
                    {!managersExpanded && hiddenManagers.length > 0 && (
                        <>
                            <button
                                type="button"
                                onClick={() => setManagersExpanded(true)}
                                className="border-border bg-card hover:bg-accent mx-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition"
                            >
                                <span className="flex -space-x-2">
                                    {hiddenManagers.slice(0, 3).map((m) => (
                                        <span key={m.id} className="ring-card inline-flex rounded-full ring-2">
                                            <NodeAvatar node={m} size={20} />
                                        </span>
                                    ))}
                                </span>
                                {t('emp_v_show_more').replace('{n}', String(hiddenManagers.length))}
                            </button>
                            <Connector />
                        </>
                    )}

                    {/* Manager chain (clickable) */}
                    {shownManagers.map((node) => (
                        <div key={node.id} className="flex flex-col">
                            <NodeCard node={node} />
                            <Connector />
                        </div>
                    ))}

                    {/* Focused person — highlighted card */}
                    <div
                        className="bg-card relative overflow-hidden rounded-lg border px-3.5 py-2.5 shadow-md"
                        style={{ borderColor: dc, boxShadow: `0 0 0 2px color-mix(in oklch, ${dc} 16%, transparent)` }}
                    >
                        <div className="flex items-start gap-2.5">
                            <NodeAvatar node={focusNode} size={42} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[14px] leading-tight font-bold">{nameOf(focusNode)}</div>
                                <div className="text-muted-foreground truncate text-[12px]">{focusNode.title || '—'}</div>
                                {focusNode.department && <div className="text-muted-foreground truncate text-[11px]">{focusNode.department}</div>}
                            </div>
                        </div>
                        {/* Footer: View profile (left) + report counts (right) */}
                        <div className="border-border mt-2.5 flex items-center justify-between gap-3 border-t pt-2">
                            {onViewProfile ? (
                                <Button variant="outline" size="sm" onClick={() => onViewProfile(focusId)}>
                                    <Contact className="h-4 w-4" />
                                    {t('emp_v_view_profile')}
                                </Button>
                            ) : (
                                <span />
                            )}
                            <div className="text-muted-foreground shrink-0 text-right text-[11px] leading-tight">
                                <div>
                                    <span className="text-foreground font-bold">{totalReports(focusId)}</span> {t('emp_v_total_reports')}
                                </div>
                                <div className="mt-0.5">
                                    <span className="text-foreground font-bold">{directCount(focusId)}</span> {t('emp_v_direct')}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Direct reports */}
                    {directReports.length > 0 ? (
                        <>
                            <div className="my-2.5 flex items-center gap-3">
                                <div className="bg-border h-px flex-1" />
                                <span className="text-muted-foreground text-[11px]">
                                    {t('emp_v_reporting_to')} <span className="text-foreground font-semibold">{nameOf(focusNode)}</span>
                                </span>
                                <div className="bg-border h-px flex-1" />
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {shownReports.map((r) => (
                                    <NodeCard key={r.id} node={r} />
                                ))}
                            </div>
                            {hiddenReportsCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setReportsExpanded(true)}
                                    className="border-border bg-card hover:bg-accent mx-auto mt-3 inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition"
                                >
                                    {t('emp_v_show_more').replace('{n}', String(hiddenReportsCount))}
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-xs">
                            <Users className="h-[15px] w-[15px] opacity-40" />
                            {t('emp_v_no_reports')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
