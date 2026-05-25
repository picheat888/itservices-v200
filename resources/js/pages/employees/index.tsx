import { AddEmployeeDrawer } from '@/components/employees/add-employee-drawer';
import { ImportEmployeeDialog } from '@/components/employees/import-employee-dialog';
import { DepartmentMembersDrawer } from '@/components/employees/department-members-drawer';
import { DepartmentModal } from '@/components/employees/department-modal';
import { EmployeeViewDrawer } from '@/components/employees/employee-view-drawer';
import { PositionModal } from '@/components/employees/position-modal';
import { ResignModal } from '@/components/employees/resign-modal';
import { ResetPasswordModal } from '@/components/employees/reset-password-modal';
import { SetCredentialsModal } from '@/components/employees/set-credentials-modal';
import { Column, DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useDepartmentMutations, useDepartments, useEmployee, useEmployeeDirectory, useEmployeeMutations, useEmployeeSummary, usePositionMutations, usePositions } from '@/hooks/use-org';
import { TableSkeleton } from '@/components/shared/skeletons';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Department, Employee, Position, Role } from '@/types';
import { Briefcase, Building2, ChevronLeft, ChevronRight, Eye, Import, KeyRound, MoreVertical, Plus, Search, ShieldCheck, SquarePen, Trash2, UserCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Tab = 'dashboard' | 'directory' | 'positions' | 'departments';

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function EmployeesPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const canManageOrg = role === 'super';
    const canAdd = perms.includes('employees.add') || role === 'super';
    const canImport = perms.includes('employees.import') || role === 'super';
    const canEdit = perms.includes('employees.edit') || role === 'super';
    const canResetPassword = perms.includes('employees.reset_password') || role === 'super';
    const canResign = perms.includes('employees.resign') || role === 'super';
    const canCancelResign = perms.includes('employees.cancel_resign') || role === 'super';
    const canSetCredentials = perms.includes('employees.set_credentials') || role === 'super';

    const [tab, setTab] = useState<Tab>('dashboard');
    const { data: summary } = useEmployeeSummary();
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();

    const [addOpen, setAddOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editEmp, setEditEmp] = useState<Employee | null>(null);
    const [viewEmp, setViewEmp] = useState<Employee | null>(null);
    const [resignEmp, setResignEmp] = useState<Employee | null>(null);
    const [resetPwEmp, setResetPwEmp] = useState<Employee | null>(null);
    const [credEmp, setCredEmp] = useState<Employee | null>(null);
    const [editPos, setEditPos] = useState<Position | null>(null);
    const [posModalOpen, setPosModalOpen] = useState(false);
    const [editDept, setEditDept] = useState<Department | null>(null);
    const [deptModalOpen, setDeptModalOpen] = useState(false);
    const [viewDept, setViewDept] = useState<Department | null>(null);

    const positionMut = usePositionMutations();
    const departmentMut = useDepartmentMutations();
    const employeeMut = useEmployeeMutations();

    // Deep-link from a notification: /employees?highlight=<id> opens that
    // employee's record on the Directory tab, then clears the param.
    const [searchParams, setSearchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const { data: highlighted } = useEmployee(highlightId ? Number(highlightId) : null);

    useEffect(() => {
        if (highlightId) setTab('directory');
    }, [highlightId]);

    useEffect(() => {
        if (highlighted) {
            setViewEmp(highlighted);
            searchParams.delete('highlight');
            setSearchParams(searchParams, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlighted]);

    const tabs: { id: Tab; label: string; count?: number }[] = [
        { id: 'dashboard', label: t('sub_dashboard') },
        { id: 'directory', label: t('sub_directory'), count: summary?.total },
        { id: 'departments', label: t('sub_departments') },
        { id: 'positions', label: t('sub_positions') },
    ];

    const posColumns: Column<Position>[] = [
        { key: 'code', header: t('pos_code'), render: (p) => <span className="font-mono text-xs">{p.code}</span> },
        { key: 'title', header: t('pos_title'), render: (p) => <span className="font-medium">{p.title}</span> },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (p) =>
                canManageOrg ? (
                    <div className="flex justify-end gap-1">
                        <button
                            onClick={() => {
                                setEditPos(p);
                                setPosModalOpen(true);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                        >
                            <SquarePen className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(`${t('confirm_delete')} ${p.title}`)) positionMut.remove.mutate(p.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">{t('employees')}</h1>
                    <p className="text-sm text-muted-foreground">{t('emp_subtitle')}</p>
                </div>
                {(canAdd || canImport) && (
                    <div className="flex items-center gap-2">
                        {canImport && (
                            <Button variant="outline" onClick={() => setImportOpen(true)}>
                                <Import className="h-4 w-4" />
                                {t('import_employee')}
                            </Button>
                        )}
                        {canAdd && (
                            <Button onClick={() => setAddOpen(true)}>
                                <Plus className="h-4 w-4" />
                                {t('add_employee')}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <Card className="overflow-hidden">
                <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-1">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => setTab(tb.id)}
                            className={cn(
                                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab === tb.id ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && <span className="ml-1.5 font-mono text-xs opacity-60">{tb.count}</span>}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {tab === 'dashboard' && <Dashboard summary={summary} departments={departments} positions={positions} />}

            {tab === 'directory' && (
                <DirectoryTab
                    departments={departments}
                    canEdit={canEdit}
                    canResetPassword={canResetPassword}
                    canResign={canResign}
                    canCancelResign={canCancelResign}
                    canSetCredentials={canSetCredentials}
                    ownEmployeeId={user?.employee_id ?? null}
                    onView={setViewEmp}
                    onEdit={setEditEmp}
                    onResign={setResignEmp}
                    onCancelResign={(e) => {
                        if (confirm(t('cancel_resign_confirm'))) employeeMut.cancelResign.mutate(e.id);
                    }}
                    onResetPassword={setResetPwEmp}
                    onSetCredentials={setCredEmp}
                />
            )}

            {tab === 'positions' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">{t('pos_all_org')}</span>
                        {canManageOrg && (
                            <Button
                                onClick={() => {
                                    setEditPos(null);
                                    setPosModalOpen(true);
                                }}
                            >
                                <Plus className="h-4 w-4" />
                                {t('add_position')}
                            </Button>
                        )}
                    </div>
                    <DataTable columns={posColumns} rows={positions} rowKey={(p) => p.id} />
                </div>
            )}

            {tab === 'departments' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-muted-foreground">{t('dept_all_org')}</span>
                        {canManageOrg && (
                            <Button
                                onClick={() => {
                                    setEditDept(null);
                                    setDeptModalOpen(true);
                                }}
                            >
                                <Plus className="h-4 w-4" />
                                {t('add_department')}
                            </Button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {departments.map((d) => (
                            <Card key={d.id} className="p-4">
                                <div className="flex items-start justify-between">
                                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{d.code}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => setViewDept(d)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent">
                                            <Eye className="h-3.5 w-3.5" />
                                        </button>
                                        {canManageOrg && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setEditDept(d);
                                                        setDeptModalOpen(true);
                                                    }}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                                                >
                                                    <SquarePen className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`${t('confirm_delete')} ${d.name}`)) departmentMut.remove.mutate(d.id);
                                                    }}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => setViewDept(d)} className="mt-3 block text-left text-base font-semibold hover:text-brand">
                                    {lang === 'th' ? d.name_th ?? d.name : d.name}
                                </button>
                                <div className="text-xs text-muted-foreground">{d.location}</div>
                                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                                    <span className="text-muted-foreground">{t('dept_head')}</span>
                                    <span className="font-medium">{d.head ?? '—'}</span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{t('dept_members')}</span>
                                    <button onClick={() => setViewDept(d)} className="font-mono font-semibold text-brand">
                                        {d.count ?? 0}
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
                </div>
            </Card>

            <AddEmployeeDrawer
                open={addOpen || !!editEmp}
                employee={editEmp}
                onClose={() => {
                    setAddOpen(false);
                    setEditEmp(null);
                }}
            />
            <ImportEmployeeDialog open={importOpen} onClose={() => setImportOpen(false)} />
            <EmployeeViewDrawer
                employee={viewEmp}
                onClose={() => setViewEmp(null)}
                canEdit={canEdit}
                isSelf={!!viewEmp && viewEmp.id === user?.employee_id}
                canResetPassword={canResetPassword}
                canResign={canResign}
                canCancelResign={canCancelResign}
                canSetCredentials={canSetCredentials}
                onResign={(e) => setResignEmp(e)}
                onCancelResign={(e) => {
                    if (confirm(t('cancel_resign_confirm'))) {
                        employeeMut.cancelResign.mutate(e.id, { onSuccess: () => setViewEmp(null) });
                    }
                }}
                onResetPassword={(e) => setResetPwEmp(e)}
                onSetCredentials={(e) => {
                    setViewEmp(null);
                    setCredEmp(e);
                }}
                onEdit={(e) => {
                    setViewEmp(null);
                    setEditEmp(e);
                }}
            />
            <ResignModal
                employee={resignEmp}
                onClose={() => setResignEmp(null)}
                onDone={() => {
                    setResignEmp(null);
                    setViewEmp(null);
                }}
            />
            <ResetPasswordModal
                employee={resetPwEmp}
                onClose={() => setResetPwEmp(null)}
            />
            <SetCredentialsModal
                employee={credEmp}
                onClose={() => setCredEmp(null)}
            />
            <PositionModal open={posModalOpen} onClose={() => setPosModalOpen(false)} position={editPos} />
            <DepartmentModal open={deptModalOpen} onClose={() => setDeptModalOpen(false)} department={editDept} />
            <DepartmentMembersDrawer department={viewDept} onClose={() => setViewDept(null)} />
        </div>
    );
}

const DIR_PAGE_SIZES = [20, 50, 100] as const;

interface DirectoryTabProps {
    departments: Department[];
    canEdit: boolean;
    canResetPassword: boolean;
    canResign: boolean;
    canCancelResign: boolean;
    canSetCredentials: boolean;
    ownEmployeeId: number | null;
    onView: (e: Employee) => void;
    onEdit: (e: Employee) => void;
    onResign: (e: Employee) => void;
    onCancelResign: (e: Employee) => void;
    onResetPassword: (e: Employee) => void;
    onSetCredentials: (e: Employee) => void;
}

function DirectoryTab({ departments, canEdit, canResetPassword, canResign, canCancelResign, canSetCredentials, ownEmployeeId, onView, onEdit, onResign, onCancelResign, onResetPassword, onSetCredentials }: DirectoryTabProps) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [search, setSearch] = useState('');
    const [deptFilter, setDeptFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<10 | 20 | 50 | 100>(20);

    const { data, isLoading } = useEmployeeDirectory({ page, per_page: pageSize, search, department_id: deptFilter, status: statusFilter });
    const rows = data?.data ?? [];
    const meta = data?.meta;
    const total = meta?.total ?? 0;
    const totalPages = meta?.last_page ?? 1;
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    const handleSearch = (v: string) => { setSearch(v); setPage(1); };
    const handleDept = (v: string) => { setDeptFilter(v); setPage(1); };
    const handleStatus = (v: string) => { setStatusFilter(v); setPage(1); };
    const handlePageSize = (v: 10 | 20 | 50 | 100) => { setPageSize(v); setPage(1); };

    const columns: Column<Employee>[] = [
        {
            key: 'name',
            header: t('sub_directory'),
            render: (e) => (
                <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                        {e.photo_url && <AvatarImage src={e.photo_url} alt="" />}
                        <AvatarFallback className="bg-brand/10 text-[11px] font-semibold text-brand">{initials(e.name)}</AvatarFallback>
                    </Avatar>
                    <div className="font-medium">{lang === 'th' ? e.name_th ?? e.name : e.name}</div>
                </div>
            ),
        },
        { key: 'code', header: t('tbl_emp_id'), render: (e) => <span className="font-mono text-xs">{e.code}</span> },
        { key: 'position', header: t('position'), render: (e) => e.position ?? '—' },
        { key: 'department', header: t('department'), render: (e) => (lang === 'th' ? e.department_th ?? e.department : e.department) ?? '—' },
        { key: 'email', header: t('emp_email'), render: (e) => <span className="font-mono text-xs">{e.email ?? '—'}</span> },
        { key: 'joined', header: t('joined'), render: (e) => <span className="font-mono text-xs">{e.joined_at ?? '—'}</span> },
        {
            key: 'status',
            header: t('status'),
            render: (e) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    {e.status === 'resigned' ? (
                        <StatusBadge tone="red">{t('resigned')}</StatusBadge>
                    ) : (
                        <StatusBadge tone="green">{t('active')}</StatusBadge>
                    )}
                    {e.status !== 'resigned' && (
                        <StatusBadge tone={e.has_account ? 'blue' : 'amber'}>
                            {e.has_account ? t('cred_has_account') : t('cred_no_account')}
                        </StatusBadge>
                    )}
                </div>
            ),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (e) => (
                <div onClick={(ev) => ev.stopPropagation()} className="flex justify-end">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
                                <MoreVertical className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onView(e)}>
                                <Eye className="h-4 w-4" />
                                {t('view')}
                            </DropdownMenuItem>
                            {canEdit && e.status !== 'resigned' && (
                                e.id === ownEmployeeId ? (
                                    <DropdownMenuItem disabled title={t('profile_edit_via')}>
                                        <SquarePen className="h-4 w-4" />
                                        {t('edit')}
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem onClick={() => onEdit(e)}>
                                        <SquarePen className="h-4 w-4" />
                                        {t('edit')}
                                    </DropdownMenuItem>
                                )
                            )}
                            {canSetCredentials && !e.has_account && e.status !== 'resigned' && (
                                <DropdownMenuItem onClick={() => onSetCredentials(e)}>
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('emp_set_credentials')}
                                </DropdownMenuItem>
                            )}
                            {canResetPassword && e.has_account && (
                                <DropdownMenuItem onClick={() => onResetPassword(e)}>
                                    <KeyRound className="h-4 w-4" />
                                    {t('reset_password')}
                                </DropdownMenuItem>
                            )}
                            {canResign && e.status !== 'resigned' && (
                                <DropdownMenuItem onClick={() => onResign(e)} className="text-destructive focus:text-destructive">
                                    <UserMinus className="h-4 w-4" />
                                    {t('resign_employee')}
                                </DropdownMenuItem>
                            )}
                            {canCancelResign && e.status === 'resigned' && (
                                <DropdownMenuItem onClick={() => onCancelResign(e)} className="text-emerald-600 focus:text-emerald-600">
                                    <UserCheck className="h-4 w-4" />
                                    {t('cancel_resign')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder={t('search_name_id')}
                        className="pl-9"
                    />
                </div>
                <Select value={deptFilter} onValueChange={handleDept}>
                    <SelectTrigger className="w-56">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('all_departments')}</SelectItem>
                        {departments.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                                {lang === 'th' ? d.name_th ?? d.name : d.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={handleStatus}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">
                            <span className="flex items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                                {t('all_status')}
                            </span>
                        </SelectItem>
                        <SelectItem value="active">
                            <span className="flex items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                                {t('active')}
                            </span>
                        </SelectItem>
                        <SelectItem value="has_account">
                            <span className="flex items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                                {t('cred_has_account')}
                            </span>
                        </SelectItem>
                        <SelectItem value="no_account">
                            <span className="flex items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                                {t('cred_no_account')}
                            </span>
                        </SelectItem>
                        <SelectItem value="resigned">
                            <span className="flex items-center gap-2">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                                {t('resigned')}
                            </span>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {isLoading ? <TableSkeleton rows={pageSize > 20 ? 8 : 5} cols={7} /> : <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={onView} hidePagination />}

            {/* Pagination bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                    <Select value={String(pageSize)} onValueChange={(v) => handlePageSize(Number(v) as 10 | 20 | 50 | 100)}>
                        <SelectTrigger className="h-8 w-[72px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DIR_PAGE_SIZES.map((s) => (
                                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-3">
                    <span>{from}–{to} {lang === 'th' ? 'จาก' : 'of'} {total}</span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="px-1 font-medium text-foreground">{page} / {totalPages}</span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import type { EmployeeSummary } from '@/services/orgApi';

function Dashboard({ summary, departments, positions }: { summary: EmployeeSummary | undefined; departments: Department[]; positions: Position[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const kpis = [
        { label: t('total_employees'), value: summary?.total ?? '—', icon: Users, tone: 'text-brand bg-brand/10' },
        { label: t('departments_count'), value: departments.length, icon: Building2, tone: 'text-brand bg-brand/10' },
        { label: t('active_positions'), value: positions.length, icon: Briefcase, tone: 'text-brand bg-brand/10' },
        { label: t('new_hires'), value: summary?.new_hires ?? '—', icon: UserPlus, tone: 'text-brand bg-brand/10' },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                        <Card key={k.label} className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="text-sm text-muted-foreground">{k.label}</div>
                                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', k.tone)}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                            </div>
                            <div className="mt-2 font-mono text-3xl font-bold">{k.value}</div>
                        </Card>
                    );
                })}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="p-5">
                    <div className="mb-4 text-sm font-semibold">{t('headcount_by_dept')}</div>
                    <div className="divide-y divide-border/60">
                        {departments.map((d) => (
                            <div key={d.id} className="flex items-center justify-between py-2.5">
                                <div className="flex items-center gap-2.5">
                                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]">{d.code}</span>
                                    <span className="text-sm">{lang === 'th' ? d.name_th ?? d.name : d.name}</span>
                                </div>
                                <span className="font-mono text-sm font-semibold">{d.count ?? 0}</span>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="p-5">
                    <div className="mb-4 text-sm font-semibold">{t('recent_hires')}</div>
                    <div className="space-y-1">
                        {(summary?.recent ?? []).map((e) => (
                            <div key={e.id} className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-brand/10 text-[11px] font-semibold text-brand">{initials(e.name)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{lang === 'th' ? e.name_th ?? e.name : e.name}</div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {e.position} · {lang === 'th' ? e.department_th ?? e.department : e.department}
                                    </div>
                                </div>
                                <span className="font-mono text-xs text-muted-foreground">{e.joined_at}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
