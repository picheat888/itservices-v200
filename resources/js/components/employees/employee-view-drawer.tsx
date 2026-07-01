import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useAccessMutations, useEmployeeAccess } from '@/hooks/use-access';
import { useAuth } from '@/modules/auth';
import { useApprovalChain, useEmployee, useOrgChart } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { deptColor } from '@/lib/org-tree';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { AccessKind, Employee, EmployeeAccessRow, OrgChartNode } from '@/shared/types';
import {
    Ban,
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
    Phone,
    RefreshCw,
    Shield,
    ShieldCheck,
    SquarePen,
    Ticket,
    TriangleAlert,
    UserCheck,
    UserMinus,
    Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function initials(name: string) {
    return (name || '?')
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

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
    const L = (th: string, en: string) => (lang === 'th' ? th : en);
    const { can } = useAuth();
    const canViewAccess = can('access.view');
    const canManageAccess = can('access.manage');

    // Access mutation hooks — called unconditionally (Rules of Hooks); the right one is picked per group when revoking.
    const emailGroupMut = useAccessMutations('email-groups');
    const fileShareMut = useAccessMutations('file-shares');
    const socialMut = useAccessMutations('social-platforms');

    const [tab, setTab] = useState<'overview' | 'org' | 'assets' | 'tickets' | 'requests' | 'access'>('overview');
    const [copied, setCopied] = useState<string | null>(null);
    useEffect(() => {
        setTab('overview');
    }, [employee?.id]);

    const { data: approvalChain = [] } = useApprovalChain(employee?.id ?? null);
    const { data: orgNodes = [] } = useOrgChart();
    const { data: access } = useEmployeeAccess(employee?.id ?? null);
    // Live copy of the employee — refetched when mutations invalidate ['employee'], so
    // setting credentials reflects immediately (No-account badge/strip clears without reload).
    const { data: liveEmp } = useEmployee(employee?.id ?? null);

    const nodeById = useMemo(() => new Map(orgNodes.map((n) => [n.id, n])), [orgNodes]);
    const directReports = useMemo(
        () => (employee ? orgNodes.filter((n) => n.manager_id === employee.id) : []),
        [orgNodes, employee],
    );

    if (!employee) return null;

    const emp = liveEmp ?? employee;
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

    // ── Access revoke ──
    // Map each access group to its AccessKind + matching mutation hook.
    const accessGroups = [
        { key: 'email_groups' as const, kind: 'email-groups' as AccessKind, mut: emailGroupMut, label: L('กลุ่มอีเมล', 'Email groups'), icon: <Mail className="h-3.5 w-3.5" /> },
        { key: 'file_shares' as const, kind: 'file-shares' as AccessKind, mut: fileShareMut, label: L('ไฟล์แชร์', 'File shares'), icon: <Folder className="h-3.5 w-3.5" /> },
        { key: 'social' as const, kind: 'social-platforms' as AccessKind, mut: socialMut, label: L('โซเชียล/อินเทอร์เน็ต', 'Social / internet'), icon: <Globe className="h-3.5 w-3.5" /> },
    ];
    const mutByKey = { email_groups: emailGroupMut, file_shares: fileShareMut, social: socialMut } as const;
    const revoking = emailGroupMut.revokeMember.isPending || fileShareMut.revokeMember.isPending || socialMut.revokeMember.isPending;

    // Revoke one membership through the mutation matching its group.
    const revokeRow = (groupKey: keyof typeof mutByKey, row: EmployeeAccessRow) =>
        mutByKey[groupKey].revokeMember.mutateAsync({ id: row.resource_id, membershipId: row.id });

    // Revoke every listed active membership across all three groups.
    const revokeAll = async () => {
        if (!access) return;
        for (const grp of accessGroups) {
            for (const row of access[grp.key]) {
                await grp.mut.revokeMember.mutateAsync({ id: row.resource_id, membershipId: row.id });
            }
        }
    };

    // ── Sub-components ──
    const RailRow = ({ icon, label, value, mono, copyKey }: { icon: React.ReactNode; label: string; value?: string | null; mono?: boolean; copyKey?: string }) => (
        <div className="group flex items-start gap-2.5">
            <div className="bg-muted text-muted-foreground grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg">{icon}</div>
            <div className="min-w-0 flex-1">
                <div className="text-muted-foreground text-[10.5px] font-medium uppercase tracking-wide">{label}</div>
                <div className={cn('mt-0.5 text-[13px] font-medium leading-snug break-words', mono && 'font-mono text-xs')}>{value || '—'}</div>
            </div>
            {copyKey && value && (
                <button
                    type="button"
                    onClick={() => copy(value, copyKey)}
                    className={cn(
                        'hover:bg-accent grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-0 transition group-hover:opacity-100',
                        copied === copyKey && 'text-emerald-600 opacity-100 dark:text-emerald-400',
                    )}
                    title={L('คัดลอก', 'Copy')}
                >
                    {copied === copyKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            )}
        </div>
    );

    const Kpi = ({ val, lbl, warn }: { val: React.ReactNode; lbl: string; warn?: boolean }) => (
        <div className="flex min-w-[46px] flex-col items-center px-2.5">
            <div className={cn('text-[16px] font-extrabold leading-none tracking-tight tabular-nums', warn && 'text-amber-500')}>{val}</div>
            <div className="text-muted-foreground mt-1 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap">{lbl}</div>
        </div>
    );

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex h-[88vh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogTitle className="sr-only">{name}</DialogTitle>

                {/* ── COVER ── (neutral chrome — no brand tint here) */}
                <div
                    className="border-border flex shrink-0 items-center gap-5 border-b px-7 pb-5 pt-6"
                    style={{ background: 'radial-gradient(120% 160% at 0% 0%, var(--accent) 0%, var(--card) 60%)' }}
                >
                    {/* Avatar — minimal: soft offset ring, gentle float shadow, monochrome fallback. */}
                    <Avatar className="ring-card h-[72px] w-[72px] shrink-0 rounded-full shadow-md ring-2">
                        {emp.photo_url && <AvatarImage src={emp.photo_url} alt="" className="rounded-full object-cover" />}
                        <AvatarFallback
                            className="text-muted-foreground rounded-full text-2xl font-semibold tracking-tight"
                            style={{ background: 'linear-gradient(135deg, var(--muted), color-mix(in oklch, var(--foreground) 8%, var(--muted)))' }}
                        >
                            {initials(emp.name)}
                        </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2.5">
                            <h2 className="text-xl font-extrabold leading-tight tracking-tight">{name}</h2>
                            {resigned ? (
                                <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[11px] font-semibold">{t('resigned')}</span>
                            ) : (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{t('active')}</span>
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
                                    {L('มีบัญชีใช้งาน', 'Has login account')}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    <TriangleAlert className="h-3 w-3" />
                                    {L('ยังไม่มีบัญชีใช้งาน', 'No login account')}
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
                        <Kpi val={<>{tenure.y}<small className="text-muted-foreground ml-0.5 text-[11px] font-semibold">{L('ปี', 'yr')}</small></>} lbl={L('อายุงาน', 'Tenure')} />
                        <div className="bg-border h-7 w-px" />
                        <Kpi val={directReports.length} lbl={L('ลูกน้อง', 'Reports')} />
                        <div className="bg-border h-7 w-px" />
                        <Kpi val={approvalChain.length} lbl={L('ขั้นอนุมัติ', 'Approval')} />
                    </div>
                </div>

                {/* ── RESIGN STRIP ── */}
                {resigned && (
                    <div className="bg-destructive/10 text-destructive border-border flex shrink-0 items-center gap-2 border-b px-7 py-2 text-[12.5px] font-medium">
                        <TriangleAlert className="h-[15px] w-[15px] shrink-0" />
                        <span>{L('พนักงานคนนี้ลาออกแล้ว', 'This employee has resigned')}</span>
                        {emp.last_day && <span className="font-mono">· {L('วันสุดท้าย', 'Last day')} {emp.last_day}</span>}
                        {emp.resign_reason && <span>· {emp.resign_reason}</span>}
                    </div>
                )}

                {/* ── NO-ACCOUNT STRIP ── shown only while the employee still has no username/password */}
                {showCredentials && (
                    <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-7 py-2.5 dark:border-amber-800 dark:bg-amber-950/20">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                            <span className="text-[12px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{t('cred_no_account')}</span>
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
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold uppercase tracking-wider">{L('ข้อมูลติดต่อ', 'Contact')}</div>
                            <RailRow icon={<Mail className="h-3.5 w-3.5" />} label={L('อีเมล', 'Email')} value={emp.email} copyKey="email" />
                            <RailRow icon={<Phone className="h-3.5 w-3.5" />} label={L('โทรศัพท์', 'Phone')} value={emp.phone} copyKey="phone" mono />
                            {emp.username && <RailRow icon={<Shield className="h-3.5 w-3.5" />} label={L('ชื่อผู้ใช้', 'Username')} value={emp.username} copyKey="user" mono />}
                        </section>

                        <section className="flex flex-col gap-3">
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold uppercase tracking-wider">{L('ข้อมูลการจ้างงาน', 'Employment')}</div>
                            <RailRow icon={<Users className="h-3.5 w-3.5" />} label={t('emp_section')} value={lang === 'th' ? (emp.section_th ?? emp.section) : emp.section} />
                            <RailRow icon={<Building2 className="h-3.5 w-3.5" />} label={t('department')} value={lang === 'th' ? (emp.department_th ?? emp.department) : emp.department} />
                            <RailRow icon={<Briefcase className="h-3.5 w-3.5" />} label={t('position')} value={emp.position} />
                            <RailRow icon={<UserCheck className="h-3.5 w-3.5" />} label={t('emp_manager')} value={managerName} />
                            <RailRow icon={<Clock className="h-3.5 w-3.5" />} label={t('joined')} value={emp.joined_at} mono />
                        </section>

                    </aside>

                    {/* MAIN */}
                    <div className="flex min-w-0 flex-1 flex-col">
                        {/* Tabs */}
                        <div className="border-border flex shrink-0 gap-1 border-b px-4 pt-2.5">
                            {([
                                { id: 'overview' as const, label: L('ภาพรวม', 'Overview'), icon: <LayoutDashboard className="h-[15px] w-[15px]" />, count: undefined as number | undefined, soon: false },
                                { id: 'org' as const, label: L('องค์กร', 'Organization'), icon: <Users className="h-[15px] w-[15px]" />, count: undefined, soon: false },
                                // Planned tabs from the design — not wired to data yet (Coming soon).
                                { id: 'assets' as const, label: L('อุปกรณ์', 'Assets'), icon: <Laptop className="h-[15px] w-[15px]" />, count: undefined, soon: true },
                                { id: 'tickets' as const, label: L('ทิกเก็ต', 'Tickets'), icon: <Ticket className="h-[15px] w-[15px]" />, count: undefined, soon: true },
                                { id: 'requests' as const, label: L('คำขอ', 'Requests'), icon: <Inbox className="h-[15px] w-[15px]" />, count: undefined, soon: true },
                                ...(canViewAccess
                                    ? [{ id: 'access' as const, label: L('สิทธิ์เข้าถึง', 'Access'), icon: <Shield className="h-[15px] w-[15px]" />, count: access ? access.email_groups.length + access.file_shares.length + access.social.length : 0, soon: false }]
                                    : []),
                            ]).map((tb) => (
                                <button
                                    key={tb.id}
                                    onClick={() => setTab(tb.id)}
                                    className={cn(
                                        'relative inline-flex items-center gap-1.5 rounded-t-lg px-3 pb-3 pt-2 text-[12.5px] font-semibold transition-colors',
                                        tab === tb.id ? '' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                    )}
                                    style={tab === tb.id ? { color: accent } : {}}
                                >
                                    {tb.icon}
                                    {tb.label}
                                    {tb.count != null && tb.count > 0 && (
                                        <span className="bg-muted text-muted-foreground inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-bold">{tb.count}</span>
                                    )}
                                    {tb.soon && (
                                        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                            {L('เร็วๆนี้', 'soon')}
                                        </span>
                                    )}
                                    {tab === tb.id && <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded" style={{ background: accent }} />}
                                </button>
                            ))}
                        </div>

                        {/* Pane — the Organization tab fills the whole area (no padding/scroll
                            here; OrgPane manages its own layout + single scroll). */}
                        <div className={cn('min-h-0 flex-1', tab === 'org' ? 'flex flex-col' : 'overflow-y-auto p-5')}>
                            {tab === 'overview' && (
                                <OverviewPane emp={emp} tenure={tenure} reports={directReports.length} steps={approvalChain.length} L={L} />
                            )}
                            {tab === 'org' && (
                                <OrgPane
                                    orgNodes={orgNodes}
                                    nodeById={nodeById}
                                    rootFocus={{ id: emp.id, name: emp.name, nameTh: emp.name_th, title: emp.position, deptCode: accentCode }}
                                    onViewProfile={onViewProfile}
                                    L={L}
                                />
                            )}
                            {tab === 'access' && (
                                <div className="space-y-5">
                                    {access?.outstanding && (
                                        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
                                            <TriangleAlert className="h-4 w-4 shrink-0" />
                                            <span className="flex-1">{L('พนักงานลาออกแล้ว — สิทธิ์เหล่านี้ยังเปิดอยู่ ควรถอน', 'Resigned — these accesses are still active and should be revoked')}</span>
                                            {canManageAccess && (
                                                <Button variant="destructive" size="sm" className="shrink-0" disabled={revoking} onClick={() => revokeAll()}>
                                                    <Ban className="h-3.5 w-3.5" />
                                                    {L('ถอนทั้งหมด', 'Revoke all')}
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                    {accessGroups.map((grp) => {
                                        const rows = access?.[grp.key] ?? [];
                                        if (rows.length === 0) return null;
                                        return (
                                            <div key={grp.key} className="space-y-2">
                                                <div className="text-muted-foreground flex items-center gap-2 text-[12.5px] font-bold">
                                                    {grp.icon}
                                                    {grp.label}
                                                    <span className="bg-muted inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-bold">{rows.length}</span>
                                                </div>
                                                {rows.map((r) => (
                                                    <div key={r.id} className="border-border bg-card flex items-center gap-3 rounded-xl border px-3 py-2.5">
                                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.resource_color ?? 'var(--brand)' }} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-sm font-medium">{r.resource_name}</div>
                                                            <div className="text-muted-foreground truncate font-mono text-[11px]">{r.resource_detail ?? r.resource_code}</div>
                                                        </div>
                                                        <span className="text-muted-foreground shrink-0 text-xs">{r.access_level ?? r.purpose ?? '—'}</span>
                                                        {canManageAccess && (
                                                            <button
                                                                type="button"
                                                                onClick={() => revokeRow(grp.key, r)}
                                                                disabled={revoking}
                                                                className="text-destructive hover:bg-destructive/10 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50"
                                                                title={L('ถอนสิทธิ์', 'Revoke')}
                                                            >
                                                                <Ban className="h-3.5 w-3.5" />
                                                                {L('ถอนสิทธิ์', 'Revoke')}
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                    {access && access.email_groups.length + access.file_shares.length + access.social.length === 0 && (
                                        <div className="text-muted-foreground py-12 text-center text-sm">{L('ไม่มีสิทธิ์เข้าถึง', 'No access permissions')}</div>
                                    )}
                                </div>
                            )}
                            {tab === 'assets' && <ComingSoon icon={<Laptop className="h-6 w-6" />} title={L('อุปกรณ์', 'Assets')} L={L} />}
                            {tab === 'tickets' && <ComingSoon icon={<Ticket className="h-6 w-6" />} title={L('ทิกเก็ต', 'Tickets')} L={L} />}
                            {tab === 'requests' && <ComingSoon icon={<Inbox className="h-6 w-6" />} title={L('คำขอ', 'Requests')} L={L} />}
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
                        {canResetPassword && emp.has_account && (
                            <Button variant="outline" onClick={() => onResetPassword(emp)}>
                                <RefreshCw className="h-4 w-4" />
                                {t('reset_password')}
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

/** Placeholder pane for tabs from the design that aren't wired to data yet. */
function ComingSoon({ icon, title, L }: { icon: React.ReactNode; title: string; L: (th: string, en: string) => string }) {
    return (
        <div className="text-muted-foreground flex min-h-[220px] flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="bg-muted text-muted-foreground grid h-14 w-14 place-items-center rounded-2xl">{icon}</div>
            <div>
                <div className="text-foreground text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-xs">{L('กำลังจะมาเร็ว ๆ นี้', 'Coming soon')}</div>
            </div>
        </div>
    );
}

/** Overview tab — summary cards. */
function OverviewPane({
    emp,
    tenure,
    reports,
    steps,
    L,
}: {
    emp: Employee;
    tenure: { y: number; m: number };
    reports: number;
    steps: number;
    L: (th: string, en: string) => string;
}) {
    const cards = [
        { icon: <Clock className="h-[17px] w-[17px]" />, val: `${tenure.y}${L('ปี', 'y')} ${tenure.m}${L('ด.', 'm')}`, lbl: L('อายุงาน', 'Tenure') },
        { icon: <Users className="h-[17px] w-[17px]" />, val: reports, lbl: L('ลูกน้อง', 'Direct reports') },
        { icon: <Crown className="h-[17px] w-[17px]" />, val: steps, lbl: L('ขั้นอนุมัติ', 'Approval steps') },
        { icon: <ShieldCheck className="h-[17px] w-[17px]" />, val: emp.has_account ? '✓' : '—', lbl: L('บัญชี', 'Account') },
    ];
    return (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {cards.map((c, i) => (
                <div key={i} className="border-border bg-muted/40 hover:border-border flex items-center gap-3 rounded-xl border p-3.5 transition hover:shadow-sm">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                        {c.icon}
                    </div>
                    <div className="min-w-0">
                        <div className="text-xl font-extrabold leading-none tracking-tight tabular-nums">{c.val}</div>
                        <div className="text-muted-foreground mt-1 text-[10.5px] font-semibold uppercase tracking-wide">{c.lbl}</div>
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
    L,
}: {
    orgNodes: OrgChartNode[];
    nodeById: Map<number, OrgChartNode>;
    rootFocus: { id: number; name: string; nameTh?: string | null; title?: string | null; deptCode?: string | null };
    onViewProfile?: (employeeId: number) => void;
    L: (th: string, en: string) => string;
}) {
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
    const focusNode: OrgChartNode =
        nodeById.get(focusId) ?? {
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
    const NavBtn = ({ onClick, disabled, title, children }: { onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode }) => (
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
            <div className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.18)' }}>
                {node.photo_url ? (
                    <img src={node.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="grid h-full w-full place-items-center font-bold text-white" style={{ background: dc, fontSize: size * 0.36 }}>
                        {initials(node.name)}
                    </div>
                )}
            </div>
        );
    };

    const Connector = () => <div className="bg-border mx-auto h-3 w-px" />;

    // Full-width card for a manager / direct report (clickable to walk the view).
    const NodeCard = ({ node }: { node: OrgChartNode }) => {
        const dc = deptColor(node.department_code);
        const total = totalReports(node.id);
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => navTo(node.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), navTo(node.id))}
                className="border-border bg-card relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg border py-1.5 pl-3 pr-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ background: dc }} />
                <NodeAvatar node={node} size={32} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold leading-tight">{nameOf(node)}</div>
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
                <NavBtn onClick={goHome} disabled={!canHome} title={L('กลับไปคนเริ่มต้น', 'Home')}>
                    <House className="h-3.5 w-3.5" />
                </NavBtn>
                <NavBtn onClick={goBack} disabled={!canBack} title={L('ย้อนกลับ', 'Back')}>
                    <ChevronLeft className="h-4 w-4" />
                </NavBtn>
                <NavBtn onClick={goNext} disabled={!canNext} title={L('ถัดไป', 'Next')}>
                    <ChevronRight className="h-4 w-4" />
                </NavBtn>
                <div className="text-muted-foreground ml-2 min-w-0 truncate text-xs">
                    <span className="text-foreground font-medium">{L('กำลังดู', 'Viewing')}:</span> {nameOf(focusNode)}
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
                                {L(`แสดงอีก ${hiddenManagers.length}`, `Show ${hiddenManagers.length} more`)}
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
                    <div className="bg-card relative rounded-lg border px-3.5 py-2.5 shadow-md" style={{ borderColor: dc, boxShadow: `0 0 0 2px color-mix(in oklch, ${dc} 16%, transparent)` }}>
                        <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-l-lg" style={{ background: dc }} />
                        <div className="flex items-start gap-2.5">
                            <NodeAvatar node={focusNode} size={42} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[14px] font-bold leading-tight">{nameOf(focusNode)}</div>
                                <div className="text-muted-foreground truncate text-[12px]">{focusNode.title || '—'}</div>
                                {focusNode.department && <div className="text-muted-foreground truncate text-[11px]">{focusNode.department}</div>}
                            </div>
                        </div>
                        {/* Footer: View profile (left) + report counts (right) */}
                        <div className="border-border mt-2.5 flex items-center justify-between gap-3 border-t pt-2">
                            {onViewProfile ? (
                                <Button variant="outline" size="sm" onClick={() => onViewProfile(focusId)}>
                                    <Contact className="h-4 w-4" />
                                    {L('ดูโปรไฟล์', 'View profile')}
                                </Button>
                            ) : (
                                <span />
                            )}
                            <div className="text-muted-foreground shrink-0 text-right text-[11px] leading-tight">
                                <div>
                                    <span className="text-foreground font-bold">{totalReports(focusId)}</span> {L('ใต้สังกัด', 'reports')}
                                </div>
                                <div className="mt-0.5">
                                    <span className="text-foreground font-bold">{directCount(focusId)}</span> {L('โดยตรง', 'direct')}
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
                                    {L('ผู้ใต้บังคับบัญชาของ', 'People reporting to')} <span className="text-foreground font-semibold">{nameOf(focusNode)}</span>
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
                                    {L(`แสดงอีก ${hiddenReportsCount}`, `Show ${hiddenReportsCount} more`)}
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-xs">
                            <Users className="h-[15px] w-[15px] opacity-40" />
                            {L('ไม่มีผู้ใต้บังคับบัญชา', 'No direct reports')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
