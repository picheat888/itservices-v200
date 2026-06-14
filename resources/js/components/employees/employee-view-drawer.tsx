import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useEmployeeAccess } from '@/hooks/use-access';
import { useApprovalChain, useOrgChart } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { deptColor } from '@/lib/org-tree';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { ApproverNode, Employee, OrgChartNode } from '@/types';
import {
    Briefcase,
    Building2,
    Check,
    Clock,
    Copy,
    Crown,
    Folder,
    Globe,
    Hash,
    LayoutDashboard,
    Mail,
    Phone,
    RefreshCw,
    Shield,
    ShieldCheck,
    SquarePen,
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

const CARD_W = 220;
const GAP = 14;

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
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const L = (th: string, en: string) => (lang === 'th' ? th : en);

    const [tab, setTab] = useState<'overview' | 'org' | 'access'>('overview');
    const [copied, setCopied] = useState<string | null>(null);
    useEffect(() => {
        setTab('overview');
    }, [employee?.id]);

    const { data: approvalChain = [] } = useApprovalChain(employee?.id ?? null);
    const { data: orgNodes = [] } = useOrgChart();
    const { data: access } = useEmployeeAccess(employee?.id ?? null);

    const nodeById = useMemo(() => new Map(orgNodes.map((n) => [n.id, n])), [orgNodes]);
    const directReports = useMemo(
        () => (employee ? orgNodes.filter((n) => n.manager_id === employee.id) : []),
        [orgNodes, employee],
    );

    if (!employee) return null;

    const emp = employee;
    const name = lang === 'th' ? (emp.name_th ?? emp.name) : emp.name;
    const altName = lang === 'th' ? emp.name : emp.name_th;
    const resigned = emp.status === 'resigned';
    const tenure = tenureOf(emp.joined_at);

    const accentCode = nodeById.get(emp.id)?.department_code ?? null;
    const accent = deptColor(accentCode);
    const accentSoft = `color-mix(in oklch, ${accent} 14%, var(--card))`;
    const accentBorder = `color-mix(in oklch, ${accent} 30%, var(--card))`;

    const showCredentials = canSetCredentials && !emp.has_account && !resigned;
    const hasAccountActions = canResetPassword || canSetCredentials || canResign || canCancelResign;

    const copy = (txt: string, key: string) => {
        try {
            navigator.clipboard?.writeText(txt);
        } catch {
            /* clipboard may be unavailable */
        }
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    const colorFor = (id: number, fallback?: string | null) => deptColor(nodeById.get(id)?.department_code ?? fallback ?? null);

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

    const OrgCard = ({ id, name: cardName, nameTh, title, deptCode, isCenter }: { id: number; name: string; nameTh?: string | null; title?: string | null; deptCode?: string | null; isCenter?: boolean }) => {
        const dc = colorFor(id, deptCode);
        const dn = lang === 'th' ? (nameTh ?? cardName) : cardName;
        return (
            <div
                className={cn('bg-card relative rounded-xl border px-4 py-3 shadow-sm', isCenter ? 'shadow-md' : 'border-border')}
                style={{ width: CARD_W, ...(isCenter ? { borderColor: dc, boxShadow: `0 0 0 3px color-mix(in oklch, ${dc} 16%, transparent)` } : {}) }}
            >
                <span aria-hidden className="absolute inset-y-0 left-0 w-[5px] rounded-l-xl" style={{ background: dc }} />
                <div className="flex items-center gap-3 pl-1">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: dc, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.18)' }}>
                        {initials(cardName)}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-bold leading-tight">{dn}</div>
                        <div className="text-muted-foreground truncate text-[11.5px]">{title || '—'}</div>
                    </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between pl-1">
                    <span className="font-mono text-[10.5px] font-semibold tracking-wide" style={{ color: dc }}>
                        {deptCode || nodeById.get(id)?.department_code || ''}
                    </span>
                    {isCenter && (
                        <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: dc, borderColor: accentBorder, background: accentSoft }}>
                            {L('กำลังดู', 'Viewing')}
                        </span>
                    )}
                </div>
            </div>
        );
    };

    const VLine = () => <div className="bg-border h-7 w-0.5 shrink-0" />;
    const Kpi = ({ val, lbl, warn }: { val: React.ReactNode; lbl: string; warn?: boolean }) => (
        <div className="flex min-w-[64px] flex-col items-center px-4">
            <div className={cn('text-[22px] font-extrabold leading-none tracking-tight tabular-nums', warn && 'text-amber-500')}>{val}</div>
            <div className="text-muted-foreground mt-1.5 text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap">{lbl}</div>
        </div>
    );

    // upward chain rendered top → direct-manager
    const chainTopDown = [...approvalChain].reverse();

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex h-[88vh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogTitle className="sr-only">{name}</DialogTitle>

                {/* ── COVER ── */}
                <div
                    className="border-border flex shrink-0 items-center gap-5 border-b px-7 pb-5 pt-6"
                    style={{ background: `radial-gradient(120% 160% at 0% 0%, ${accentSoft} 0%, var(--card) 58%)` }}
                >
                    <Avatar className="h-[72px] w-[72px] shrink-0 rounded-2xl" style={{ boxShadow: `0 0 0 4px ${accentBorder}, 0 0 0 8px var(--card)` }}>
                        {emp.photo_url && <AvatarImage src={emp.photo_url} alt="" className="rounded-2xl" />}
                        <AvatarFallback className="rounded-2xl text-2xl font-extrabold text-white" style={{ background: accent }}>
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
                        </div>
                        {altName && <div className="text-muted-foreground mb-2.5 text-[13px]">{altName}</div>}
                        <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium" style={{ color: accent, background: accentSoft, borderColor: accentBorder }}>
                                <Hash className="h-3 w-3" />
                                {emp.code}
                            </span>
                            <span className="bg-muted border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                                <Briefcase className="text-muted-foreground h-3 w-3" />
                                {emp.position || '—'}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ color: accent, background: accentSoft, borderColor: accentBorder }}>
                                <Building2 className="h-3 w-3" />
                                {lang === 'th' ? (emp.department_th ?? emp.department) : emp.department}
                            </span>
                        </div>
                    </div>

                    {/* KPI strip */}
                    <div className="border-border bg-card hidden shrink-0 items-center rounded-2xl border px-5 py-3.5 shadow-sm sm:flex">
                        <Kpi val={<>{tenure.y}<small className="text-muted-foreground ml-0.5 text-[13px] font-semibold">{L('ปี', 'yr')}</small></>} lbl={L('อายุงาน', 'Tenure')} />
                        <div className="bg-border h-9 w-px" />
                        <Kpi val={directReports.length} lbl={L('ลูกน้อง', 'Reports')} />
                        <div className="bg-border h-9 w-px" />
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

                {/* ── BODY ── */}
                <div className="flex min-h-0 flex-1">
                    {/* RAIL */}
                    <aside className="border-border flex w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-r p-5">
                        <section className="flex flex-col gap-3">
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold uppercase tracking-wider">{L('ข้อมูลติดต่อ', 'Contact')}</div>
                            <RailRow icon={<Mail className="h-3.5 w-3.5" />} label={L('อีเมล', 'Email')} value={emp.email} copyKey="email" />
                            <RailRow icon={<Phone className="h-3.5 w-3.5" />} label={L('โทรศัพท์', 'Phone')} value={emp.phone} copyKey="phone" mono />
                            {emp.username && <RailRow icon={<Shield className="h-3.5 w-3.5" />} label={L('ชื่อผู้ใช้', 'Username')} value={emp.username} copyKey="user" mono />}
                            <div className="flex items-center gap-1.5 text-xs">
                                {emp.has_account ? (
                                    <span className="text-muted-foreground inline-flex items-center gap-1">
                                        <ShieldCheck className="text-brand h-3.5 w-3.5" />
                                        {L('มีบัญชีใช้งาน', 'Has login account')}
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                        <TriangleAlert className="h-3.5 w-3.5" />
                                        {L('ยังไม่มีบัญชีใช้งาน', 'No login account')}
                                    </span>
                                )}
                            </div>
                        </section>

                        <section className="flex flex-col gap-3">
                            <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold uppercase tracking-wider">{L('ข้อมูลการจ้างงาน', 'Employment')}</div>
                            <RailRow icon={<Building2 className="h-3.5 w-3.5" />} label={t('department')} value={lang === 'th' ? (emp.department_th ?? emp.department) : emp.department} />
                            <RailRow icon={<Briefcase className="h-3.5 w-3.5" />} label={t('position')} value={emp.position} />
                            <RailRow icon={<Users className="h-3.5 w-3.5" />} label={t('emp_section')} value={lang === 'th' ? (emp.section_th ?? emp.section) : emp.section} />
                            <RailRow icon={<Clock className="h-3.5 w-3.5" />} label={t('joined')} value={emp.joined_at} mono />
                        </section>

                        {showCredentials && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('cred_no_account')}
                                </div>
                                <p className="text-muted-foreground mt-1.5 text-xs">{t('cred_no_account_desc')}</p>
                                <Button size="sm" className="mt-2.5 w-full" onClick={() => onSetCredentials(emp)}>
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('emp_set_credentials')}
                                </Button>
                            </div>
                        )}

                        {hasAccountActions && (
                            <section className="flex flex-col gap-3">
                                <div className="text-muted-foreground border-border border-b pb-1.5 text-[10.5px] font-bold uppercase tracking-wider">{L('บัญชีและการเข้าถึง', 'Account & access')}</div>
                                <div className="flex flex-col gap-1.5">
                                    {canResetPassword && emp.has_account && (
                                        <Button variant="outline" size="sm" className="justify-start" onClick={() => onResetPassword(emp)}>
                                            <RefreshCw className="h-4 w-4" />
                                            {t('reset_password')}
                                        </Button>
                                    )}
                                    {canResign && !resigned && (
                                        <Button variant="outline" size="sm" className="text-destructive justify-start" onClick={() => onResign(emp)}>
                                            <UserMinus className="h-4 w-4" />
                                            {t('resign_employee')}
                                        </Button>
                                    )}
                                    {canCancelResign && resigned && (
                                        <Button variant="outline" size="sm" className="justify-start text-emerald-600 dark:text-emerald-400" onClick={() => onCancelResign(emp)}>
                                            <UserCheck className="h-4 w-4" />
                                            {t('cancel_resign')}
                                        </Button>
                                    )}
                                </div>
                            </section>
                        )}
                    </aside>

                    {/* MAIN */}
                    <div className="flex min-w-0 flex-1 flex-col">
                        {/* Tabs */}
                        <div className="border-border flex shrink-0 gap-1 border-b px-4 pt-2.5">
                            {([
                                { id: 'overview' as const, label: L('ภาพรวม', 'Overview'), icon: <LayoutDashboard className="h-[15px] w-[15px]" /> },
                                { id: 'org' as const, label: L('องค์กร', 'Organization'), icon: <Users className="h-[15px] w-[15px]" />, count: directReports.length + approvalChain.length },
                                { id: 'access' as const, label: L('สิทธิ์เข้าถึง', 'Access'), icon: <Shield className="h-[15px] w-[15px]" />, count: access ? access.email_groups.length + access.file_shares.length + access.social.length : 0 },
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
                                    {tab === tb.id && <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded" style={{ background: accent }} />}
                                </button>
                            ))}
                        </div>

                        {/* Pane */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {tab === 'overview' && (
                                <OverviewPane emp={emp} tenure={tenure} reports={directReports.length} steps={approvalChain.length} accent={accent} accentSoft={accentSoft} L={L} />
                            )}
                            {tab === 'org' && (
                                <OrgPane
                                    chainTopDown={chainTopDown}
                                    directReports={directReports}
                                    OrgCard={OrgCard}
                                    VLine={VLine}
                                    focus={{ id: emp.id, name: emp.name, nameTh: emp.name_th, title: emp.position, deptCode: accentCode }}
                                    L={L}
                                />
                            )}
                            {tab === 'access' && (
                                <div className="space-y-5">
                                    {access?.outstanding && (
                                        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium">
                                            <TriangleAlert className="h-4 w-4" />
                                            {L('พนักงานลาออกแล้ว — สิทธิ์เหล่านี้ยังเปิดอยู่ ควรถอน', 'Resigned — these accesses are still active and should be revoked')}
                                        </div>
                                    )}
                                    {[
                                        { key: 'email_groups' as const, label: L('กลุ่มอีเมล', 'Email groups'), icon: <Mail className="h-3.5 w-3.5" /> },
                                        { key: 'file_shares' as const, label: L('ไฟล์แชร์', 'File shares'), icon: <Folder className="h-3.5 w-3.5" /> },
                                        { key: 'social' as const, label: L('โซเชียล/อินเทอร์เน็ต', 'Social / internet'), icon: <Globe className="h-3.5 w-3.5" /> },
                                    ].map((grp) => {
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
                        </div>
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div className="border-border bg-card flex shrink-0 items-center justify-between gap-2.5 border-t px-5 py-3">
                    <div className="text-muted-foreground truncate font-mono text-xs">{emp.email || emp.code}</div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            {t('cancel')}
                        </Button>
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

/** Overview tab — summary cards. */
function OverviewPane({
    emp,
    tenure,
    reports,
    steps,
    accent,
    accentSoft,
    L,
}: {
    emp: Employee;
    tenure: { y: number; m: number };
    reports: number;
    steps: number;
    accent: string;
    accentSoft: string;
    L: (th: string, en: string) => string;
}) {
    const cards = [
        { icon: <Clock className="h-[17px] w-[17px]" />, val: `${tenure.y}${L('ปี', 'y')} ${tenure.m}${L('ด.', 'm')}`, lbl: L('อายุงาน', 'Tenure'), tint: true },
        { icon: <Users className="h-[17px] w-[17px]" />, val: reports, lbl: L('ลูกน้อง', 'Direct reports') },
        { icon: <Crown className="h-[17px] w-[17px]" />, val: steps, lbl: L('ขั้นอนุมัติ', 'Approval steps') },
        { icon: <ShieldCheck className="h-[17px] w-[17px]" />, val: emp.has_account ? '✓' : '—', lbl: L('บัญชี', 'Account') },
    ];
    return (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {cards.map((c, i) => (
                <div key={i} className="border-border bg-muted/40 hover:border-border flex items-center gap-3 rounded-xl border p-3.5 transition hover:shadow-sm">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={c.tint ? { background: accentSoft, color: accent } : { background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
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

/** Organization tab — manager chain (top → down), focused employee, direct reports. */
function OrgPane({
    chainTopDown,
    directReports,
    OrgCard,
    VLine,
    focus,
    L,
}: {
    chainTopDown: ApproverNode[];
    directReports: OrgChartNode[];
    OrgCard: (p: { id: number; name: string; nameTh?: string | null; title?: string | null; deptCode?: string | null; isCenter?: boolean }) => React.ReactNode;
    VLine: () => React.ReactNode;
    focus: { id: number; name: string; nameTh?: string | null; title?: string | null; deptCode?: string | null };
    L: (th: string, en: string) => string;
}) {
    const Label = ({ children }: { children: React.ReactNode }) => (
        <div className="text-muted-foreground my-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">{children}</div>
    );

    const drTotal = directReports.length * CARD_W + (directReports.length - 1) * GAP;
    const drCenters = directReports.map((_, i) => i * (CARD_W + GAP) + CARD_W / 2);

    return (
        <div className="flex w-full flex-col items-center overflow-x-auto pb-7">
            {chainTopDown.length === 0 && <div className="bg-muted border-border text-muted-foreground mb-1 rounded-full border px-3.5 py-1 text-[10.5px] font-semibold">{L('ระดับสูงสุดในโครงสร้าง', 'Top of hierarchy')}</div>}

            {chainTopDown.map((node, i) => (
                <div key={node.id} className="flex flex-col items-center">
                    {i === 0 && chainTopDown.length > 0 && <Label>{L('สายบังคับบัญชา', 'Reporting line')}</Label>}
                    <OrgCard id={node.id} name={node.name} nameTh={node.name_th} title={node.position} />
                    <VLine />
                </div>
            ))}

            {/* Focused employee */}
            <OrgCard id={focus.id} name={focus.name} nameTh={focus.nameTh} title={focus.title} deptCode={focus.deptCode} isCenter />

            {/* Direct reports */}
            {directReports.length === 1 && (
                <>
                    <Label>{L('ผู้ใต้บังคับบัญชา', 'Direct report')}</Label>
                    <VLine />
                    <OrgCard id={directReports[0].id} name={directReports[0].name} nameTh={directReports[0].name_th} title={directReports[0].title} deptCode={directReports[0].department_code} />
                </>
            )}

            {directReports.length > 1 && (
                <>
                    <Label>
                        {L('ผู้ใต้บังคับบัญชา', 'Direct reports')}
                        <span className="bg-muted border-border text-muted-foreground inline-grid h-4 min-w-4 place-items-center rounded-lg border px-1 font-mono text-[10px] font-bold">{directReports.length}</span>
                    </Label>
                    <VLine />
                    <div className="flex max-w-full flex-col items-center overflow-x-auto pb-1">
                        <svg width={drTotal} height={24} className="mx-auto block overflow-visible">
                            <line x1={drCenters[0]} y1={0} x2={drCenters[drCenters.length - 1]} y2={0} className="stroke-border" strokeWidth={1.5} />
                            {drCenters.map((cx, i) => (
                                <line key={i} x1={cx} y1={0} x2={cx} y2={24} className="stroke-border" strokeWidth={1.5} />
                            ))}
                        </svg>
                        <div className="flex" style={{ gap: GAP }}>
                            {directReports.map((r) => (
                                <OrgCard key={r.id} id={r.id} name={r.name} nameTh={r.name_th} title={r.title} deptCode={r.department_code} />
                            ))}
                        </div>
                    </div>
                </>
            )}

            {directReports.length === 0 && (
                <div className="text-muted-foreground mt-4 flex items-center gap-1.5 text-xs">
                    <Users className="h-[15px] w-[15px] opacity-40" />
                    {L('ไม่มีผู้ใต้บังคับบัญชา', 'No direct reports')}
                </div>
            )}
        </div>
    );
}
