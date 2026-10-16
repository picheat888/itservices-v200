import { useT } from '@/lang';
import { dialogTabId, DialogTabs, type DialogTab } from '@/shared/components/dialog-tabs';
import { InfoHint } from '@/shared/components/info-hint';
import { RecordStamps } from '@/shared/components/record-stamps';
import { StatusBadge } from '@/shared/components/status-badge';
import { initials } from '@/shared/components/user-avatar';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import type { Employee, OrgChartNode } from '@/shared/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import {
    Briefcase,
    Building2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Contact,
    Crown,
    Hash,
    House,
    Inbox,
    Laptop,
    LayoutDashboard,
    Mail,
    Phone,
    Shield,
    ShieldCheck,
    SquarePen,
    Ticket,
    Trash2,
    TriangleAlert,
    UserCheck,
    UserMinus,
    Users,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
    useApprovalChain,
    useEmployee,
    useEmployeeAccess,
    useEmployeeAssets,
    useEmployeeRequests,
    useEmployeeTickets,
    useOrgChart,
} from '../hooks/use-employees';
import { deptColor, deptFill } from '../lib/org-tree';
import { AccessPane, AssetsPane, IdChip, RAIL_HEADING, RailRow, RequestsPane, TicketsPane } from './employee-panes';

type DrawerTab = 'overview' | 'org' | 'assets' | 'tickets' | 'requests' | 'access';

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
    canDelete,
    onResign,
    onCancelResign,
    onResetPassword,
    onSetCredentials,
    onDelete,
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
    /** Offer Delete in the footer — true only for viewers who hold employees.delete. */
    canDelete: boolean;
    onResign: (e: Employee) => void;
    onCancelResign: (e: Employee) => void;
    onResetPassword: (e: Employee) => void;
    onSetCredentials: (e: Employee) => void;
    onDelete: (e: Employee) => void;
    onEdit: (e: Employee) => void;
    /** Open another person's profile (from the org explorer's "View profile"). */
    onViewProfile?: (employeeId: number) => void;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);

    const [tab, setTab] = useState<DrawerTab>('overview');
    const [copied, setCopied] = useState<string | null>(null);
    const panelId = useId();
    // Keep the last employee rendered so Radix can play the close animation
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);
    useEffect(() => {
        setTab('overview');
    }, [shown?.id]);

    // Keyed to the employee on screen; `isLoading` keeps "not loaded yet" apart from "has nothing"
    const { data: approvalChain = [] } = useApprovalChain(shown?.id ?? null);
    const { data: orgNodes = [] } = useOrgChart();
    const { data: access, isLoading: accessLoading } = useEmployeeAccess(shown?.id ?? null);
    const { data: heldAssets = [], isLoading: assetsLoading } = useEmployeeAssets(shown?.id ?? null);
    const { data: requestedTickets = [], isLoading: ticketsLoading } = useEmployeeTickets(shown?.id ?? null);
    const { data: ownedRequests = [], isLoading: requestsLoading } = useEmployeeRequests(shown?.id ?? null);
    // Live copy so mutations (e.g. set credentials) show without a reload
    const { data: liveEmp } = useEmployee(shown?.id ?? null);

    const nodeById = useMemo(() => new Map(orgNodes.map((n) => [n.id, n])), [orgNodes]);
    const directReports = useMemo(() => (shown ? orgNodes.filter((n) => n.manager_id === shown.id) : []), [orgNodes, shown]);

    if (!shown) return null;

    // The id check stops a previous employee's record from drawing under this name
    const emp = liveEmp && liveEmp.id === shown.id ? liveEmp : shown;
    const name = lang === 'th' ? (emp.name_th ?? emp.name) : emp.name;
    const altName = lang === 'th' ? emp.name : emp.name_th;
    const resigned = emp.status === 'resigned';
    // Un-deletable until the single-employee fetch brings the blockers
    const blockers = emp.delete_blockers;
    const deletable = !!blockers && blockers.length === 0;
    const deleteBlockedReason = deletable ? undefined : blockers?.map((b) => t(`emp_del_block_${b}`)).join('\n');
    const tenure = tenureOf(emp.joined_at);
    // The person this employee reports to (their manager), resolved from the org list.
    const managerNode = emp.manager_id ? nodeById.get(emp.manager_id) : null;
    const manager = managerNode ?? (emp.manager_name ? { name: emp.manager_name, name_th: emp.manager_name_th ?? null } : null);
    const managerName = manager ? (lang === 'th' ? (manager.name_th ?? manager.name) : manager.name) : null;

    const accentCode = nodeById.get(emp.id)?.department_code ?? null;

    const showCredentials = canSetCredentials && !emp.has_account && !resigned;

    // "Copied" only once the clipboard write has actually succeeded
    const copy = async (txt: string, key: string) => {
        try {
            await navigator.clipboard.writeText(txt);
        } catch {
            return;
        }
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    const tabs: DialogTab<DrawerTab>[] = [
        { id: 'overview', label: t('nav_overview'), icon: LayoutDashboard },
        { id: 'org', label: t('emp_v_tab_org'), icon: Users },
        // No count until this person's own list is known
        { id: 'assets', label: t('emp_v_tab_assets'), icon: Laptop, count: assetsLoading ? undefined : heldAssets.length },
        { id: 'tickets', label: t('emp_v_tab_tickets'), icon: Ticket, count: ticketsLoading ? undefined : requestedTickets.length },
        { id: 'requests', label: t('requests'), icon: Inbox, count: requestsLoading ? undefined : ownedRequests.length },
        {
            id: 'access',
            label: t('emp_v_tab_access'),
            icon: Shield,
            count: access ? access.email_groups.length + access.file_shares.length + access.social.length + access.software.length : undefined,
        },
    ];
    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex h-[88vh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogTitle className="sr-only">{name}</DialogTitle>
                <span role="status" aria-live="polite" className="sr-only">
                    {copied ? t('cred_copied') : ''}
                </span>

                {/* Cover */}
                <div className="border-border flex shrink-0 items-center gap-4 border-b bg-[radial-gradient(120%_160%_at_0%_0%,var(--accent)_0%,var(--card)_60%)] px-5 pt-6 pb-5 lg:gap-5 lg:px-7">
                    <Avatar className="ring-card h-[72px] w-[72px] shrink-0 rounded-full shadow-md ring-2">
                        {emp.photo_url && <AvatarImage src={emp.photo_url} alt="" className="rounded-full object-cover" />}
                        <AvatarFallback className="text-muted-foreground from-muted rounded-full bg-linear-135 to-[color-mix(in_oklch,var(--foreground)_8%,var(--muted))] text-2xl font-semibold tracking-tight">
                            {initials(emp.name || '?')}
                        </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2.5">
                            <h2 className="text-xl leading-tight font-extrabold tracking-tight">{name}</h2>
                            <StatusBadge tone={resigned ? 'red' : 'green'} className="px-2 text-[11px] font-semibold">
                                {resigned ? t('resigned') : t('active')}
                            </StatusBadge>
                            {emp.is_super_admin && (
                                <span className="bg-brand/10 text-brand-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                                    <Crown className="h-3 w-3" />
                                    {t('emp_super_admin')}
                                </span>
                            )}
                            {/* Login-account state */}
                            {emp.has_account ? (
                                <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                                    <ShieldCheck className="text-brand h-3 w-3" />
                                    {t('emp_v_has_account')}
                                </span>
                            ) : (
                                <StatusBadge tone="amber" dot={false} className="gap-1 px-2 text-[11px] font-semibold">
                                    <TriangleAlert className="h-3 w-3" />
                                    {t('emp_v_no_account')}
                                </StatusBadge>
                            )}
                        </div>
                        {altName && <div className="text-muted-foreground mb-2.5 text-[13px]">{altName}</div>}
                        <div className="flex flex-wrap gap-1.5">
                            <IdChip icon={Hash}>{emp.code}</IdChip>
                            <IdChip icon={Briefcase}>{emp.position || '—'}</IdChip>
                            <IdChip icon={Building2}>{lang === 'th' ? (emp.department_th ?? emp.department) : emp.department}</IdChip>
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

                {/* Resign strip */}
                {resigned && (
                    <div className="bg-destructive/10 dark:text-destructive border-border flex shrink-0 items-center gap-2 border-b px-5 py-2 text-[12.5px] font-medium text-red-700 lg:px-7">
                        <TriangleAlert className="h-[15px] w-[15px] shrink-0" />
                        <span>{t('emp_v_resigned_note')}</span>
                        {emp.last_day && (
                            <span className="ml-2">
                                {t('emp_v_last_day')} {fmt.date(emp.last_day)}
                            </span>
                        )}
                        {emp.resign_reason && <span className="ml-2">{emp.resign_reason}</span>}
                    </div>
                )}

                {/* No-account strip */}
                {showCredentials && (
                    <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 lg:px-7 dark:border-amber-800 dark:bg-amber-950/20">
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

                {/* Body */}
                <div className="flex min-h-0 flex-1">
                    {/* Rail */}
                    <aside className="border-border flex w-[232px] shrink-0 flex-col gap-5 overflow-y-auto border-r p-4 xl:w-[300px] xl:p-5">
                        <section className="flex flex-col gap-3">
                            <div className={RAIL_HEADING}>{t('emp_v_contact')}</div>
                            <RailRow
                                icon={<Mail className="h-3.5 w-3.5" />}
                                label={t('emp_email')}
                                value={emp.email}
                                copied={copied === 'email'}
                                onCopy={(v) => copy(v, 'email')}
                            />
                            <RailRow
                                icon={<Phone className="h-3.5 w-3.5" />}
                                label={t('emp_phone')}
                                value={emp.phone}
                                copied={copied === 'phone'}
                                onCopy={(v) => copy(v, 'phone')}
                            />
                        </section>

                        {/* Login credentials: username only, never the password */}
                        <section className="flex flex-col gap-3">
                            <div className={RAIL_HEADING}>{t('emp_v_credentials')}</div>
                            <RailRow
                                icon={<Shield className="h-3.5 w-3.5" />}
                                label={t('emp_username')}
                                value={emp.username}
                                copied={copied === 'user'}
                                onCopy={(v) => copy(v, 'user')}
                            />
                        </section>

                        <section className="flex flex-col gap-3">
                            <div className={RAIL_HEADING}>{t('emp_v_employment')}</div>
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
                            <RailRow icon={<Clock className="h-3.5 w-3.5" />} label={t('joined')} value={fmt.date(emp.joined_at)} />
                        </section>
                    </aside>

                    {/* Main */}
                    <div className="flex min-w-0 flex-1 flex-col">
                        <DialogTabs className="px-2 pt-1 lg:px-3" tabs={tabs} active={tab} onChange={setTab} label={name} panelId={panelId} />

                        {/* Pane: Org fills it; Assets/Tickets/Requests need flex-col or fillHeight tables collapse to one row */}
                        <div
                            role="tabpanel"
                            id={panelId}
                            aria-labelledby={dialogTabId(panelId, tab)}
                            className={cn(
                                'min-h-0 flex-1',
                                tab === 'org'
                                    ? 'flex flex-col'
                                    : tab === 'assets' || tab === 'tickets' || tab === 'requests'
                                      ? 'flex flex-col p-4 xl:p-5'
                                      : 'overflow-y-auto p-4 xl:p-5',
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
                            {tab === 'access' && <AccessPane access={access} loading={accessLoading} emptyText={t('emp_v_no_access')} />}
                            {tab === 'assets' && (
                                <AssetsPane assets={heldAssets} lang={lang} loading={assetsLoading} emptyText={t('emp_v_no_assets')} />
                            )}
                            {tab === 'tickets' && (
                                <TicketsPane tickets={requestedTickets} loading={ticketsLoading} emptyText={t('emp_v_no_tickets')} />
                            )}
                            {tab === 'requests' && (
                                <RequestsPane requests={ownedRequests} loading={requestsLoading} emptyText={t('emp_v_no_requests')} />
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-border bg-card flex shrink-0 items-center justify-between gap-2.5 border-t px-5 py-3">
                    {/* Delete sits far left; disabled with its blockers in a hint once the person has history */}
                    {canDelete && (
                        <div className="flex items-center gap-1.5">
                            <Button variant="outline" className="text-destructive" disabled={!deletable} onClick={() => onDelete(emp)}>
                                <Trash2 className="h-4 w-4" />
                                {t('delete')}
                            </Button>
                            {deleteBlockedReason && <InfoHint text={`${t('emp_v_delete_blocked')}\n${deleteBlockedReason}`} />}
                        </div>
                    )}
                    {/* Account actions beside Edit; ml-auto keeps them right when Delete is absent */}
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
                            <Button variant="outline" className="text-emerald-700 dark:text-emerald-400" onClick={() => onCancelResign(emp)}>
                                <UserCheck className="h-4 w-4" />
                                {t('cancel_resign')}
                            </Button>
                        )}
                        {canEdit && !resigned && emp.is_super_admin && !isSuperViewer && <InfoHint text={t('emp_admin_protected')} />}
                        {canEdit && !resigned && (
                            <Button onClick={() => onEdit(emp)} disabled={emp.is_super_admin && !isSuperViewer}>
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
        <div className="flex min-h-full flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {cards.map((c, i) => (
                    <div
                        key={i}
                        className="border-border bg-muted/40 hover:border-border flex items-center gap-3 rounded-xl border p-3.5 transition hover:shadow-sm"
                    >
                        <div className="bg-accent text-accent-foreground grid h-9 w-9 shrink-0 place-items-center rounded-[10px]">{c.icon}</div>
                        <div className="min-w-0">
                            <div className="text-xl leading-none font-extrabold tracking-tight tabular-nums">{c.val}</div>
                            <div className="text-muted-foreground mt-1 text-xs font-semibold">{c.lbl}</div>
                        </div>
                    </div>
                ))}
            </div>
            <RecordStamps
                className="mt-auto text-right"
                createdAt={emp.created_at}
                createdBy={emp.created_by_name}
                updatedAt={emp.updated_at}
                updatedBy={emp.updated_by_name}
            />
        </div>
    );
}

/** Organization tab: Teams-style explorer (managers, the person, direct reports) with Home/Back/Next history. */
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

    // Managers / reports shown before a "Show N more" control
    const VISIBLE_MANAGERS = 2;
    const VISIBLE_REPORTS = 6;

    // Browse history: history[ptr] is on screen, index 0 is the Home person
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
        section: null,
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

    const Connector = () => <div className="bg-border mx-auto h-3 w-px" />;

    // Manager / report card; clicking walks the view to that person
    const NodeCard = ({ node }: { node: OrgChartNode }) => {
        const total = totalReports(node.id);
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => navTo(node.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), navTo(node.id))}
                className="border-border bg-card focus-visible:ring-brand relative flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg border py-1.5 pr-2.5 pl-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
                <NavBtn onClick={goHome} disabled={!canHome} label={t('emp_v_home')}>
                    <House className="h-3.5 w-3.5" />
                </NavBtn>
                <NavBtn onClick={goBack} disabled={!canBack} label={t('back')}>
                    <ChevronLeft className="h-4 w-4" />
                </NavBtn>
                <NavBtn onClick={goNext} disabled={!canNext} label={t('next')}>
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

// Cover KPI cell
function Kpi({ val, lbl, warn }: { val: React.ReactNode; lbl: string; warn?: boolean }) {
    return (
        <div className="flex min-w-[46px] flex-col items-center px-2.5">
            <div className={cn('text-[16px] leading-none font-extrabold tracking-tight tabular-nums', warn && 'text-amber-700 dark:text-amber-400')}>
                {val}
            </div>
            <div className="text-muted-foreground mt-1 text-[11px] font-semibold whitespace-nowrap">{lbl}</div>
        </div>
    );
}

// Icon-only Home / Back / Next button of the org explorer
function NavBtn({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            className="border-border bg-card text-foreground hover:bg-accent focus-visible:ring-brand grid h-7 w-7 place-items-center rounded-md border transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );
}

// Round photo or initials on the department fill
function NodeAvatar({ node, size }: { node: OrgChartNode; size: number }) {
    return (
        <div className="shrink-0 overflow-hidden rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,.18)]" style={{ width: size, height: size }}>
            {node.photo_url ? (
                <img src={node.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
                <div
                    className="grid h-full w-full place-items-center font-bold text-white"
                    style={{ background: deptFill(node.department_code), fontSize: size * 0.36 }}
                >
                    {initials(node.name || '?')}
                </div>
            )}
        </div>
    );
}
