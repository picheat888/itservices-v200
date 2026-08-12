import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { TableSkeleton } from '@/shared/components/skeletons';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { Department, Employee, Position } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { useUiStore } from '@/stores/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
    Briefcase,
    Building2,
    ChevronLeft,
    ChevronRight,
    Eye,
    Import,
    Info,
    KeyRound,
    Layers,
    MoreVertical,
    Plus,
    Search,
    ShieldCheck,
    SquarePen,
    Trash2,
    UserCheck,
    UserMinus,
    UserPlus,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AddEmployeeDrawer } from '../components/add-employee-drawer';
import { DepartmentMembersDialog } from '../components/department-members-dialog';
import { DepartmentModal } from '../components/department-modal';
import { EditEmployeeDialog } from '../components/edit-employee-dialog';
import { EmployeeViewDrawer } from '../components/employee-view-drawer';
import { HiresTrendCard } from '../components/hires-trend-card';
import { ImportEmployeeDialog } from '../components/import-employee-dialog';
import { ManageCredentialsModal } from '../components/manage-credentials-modal';
import { OrgChartTab } from '../components/org-chart/org-chart-tab';
import { PositionMembersDialog } from '../components/position-members-dialog';
import { PositionModal } from '../components/position-modal';
import { ResignModal } from '../components/resign-modal';
import { SectionsTab } from '../components/sections-tab';
import { SetCredentialsModal } from '../components/set-credentials-modal';
import { useDepartmentMutations, useDepartments } from '../hooks/use-departments';
import { useEmployee, useEmployeeDirectory, useEmployeeMutations, useEmployeeSummary } from '../hooks/use-employees';
import { usePositionMutations, usePositions } from '../hooks/use-positions';

const TAB_IDS = ['dashboard', 'directory', 'positions', 'departments', 'sections', 'orgchart'] as const;
type Tab = (typeof TAB_IDS)[number];

const isTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

/** One entry on the sub-tab bar; `count` renders as a small badge with `countTitle` as its tooltip. */
interface TabItem {
    id: Tab;
    label: string;
    count?: number;
    countTitle?: string;
}

/** Resolve the starting tab from the URL (?tab=) so reloads / shared links are exact; otherwise the dashboard. */
function initialTab(): Tab {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    return isTab(fromUrl) ? fromUrl : 'dashboard';
}

export default function EmployeesPage() {
    const t = useT();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { can, isSuper } = useAuth();
    const canAdd = can('employees.add');
    const canImport = can('employees.import');
    const canEdit = can('employees.edit');
    const canResetPassword = can('employees.reset_password');
    const canResign = can('employees.resign');
    const canCancelResign = can('employees.cancel_resign');
    const canSetCredentials = can('employees.set_credentials');

    const canViewDashboard = can('employees.view_dashboard');
    const canViewDirectory = can('employees.view');
    const canViewSections = can('employees.view_section');
    const canViewDepartments = can('employees.view_department');
    const canViewPositions = can('employees.view_position');
    const canViewOrg = can('employees.view_org');

    const canSectionAdd = can('employees.section_add');
    const canSectionEdit = can('employees.section_edit');
    const canSectionDelete = can('employees.section_delete');
    const canDeptAdd = can('employees.department_add');
    const canDeptEdit = can('employees.department_edit');
    const canDeptDelete = can('employees.department_delete');
    const canPosAdd = can('employees.position_add');
    const canPosEdit = can('employees.position_edit');
    const canPosDelete = can('employees.position_delete');
    const canPosSpecial = can('employees.position_special');

    const [tab, setTab] = useState<Tab>(initialTab);
    const { data: summary, isLoading: summaryLoading } = useEmployeeSummary();
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();

    const [importOpen, setImportOpen] = useState(false);
    const [editEmp, setEditEmp] = useState<Employee | null>(null);
    const [resignEmp, setResignEmp] = useState<Employee | null>(null);
    const [resetPwEmp, setResetPwEmp] = useState<Employee | null>(null);
    const [credEmp, setCredEmp] = useState<Employee | null>(null);
    const [editPos, setEditPos] = useState<Position | null>(null);
    const [posModalOpen, setPosModalOpen] = useState(false);
    const [viewPos, setViewPos] = useState<Position | null>(null);
    const [editDept, setEditDept] = useState<Department | null>(null);
    const [deptModalOpen, setDeptModalOpen] = useState(false);
    const [viewDept, setViewDept] = useState<Department | null>(null);

    const positionMut = usePositionMutations();
    const departmentMut = useDepartmentMutations();
    const employeeMut = useEmployeeMutations();

    // The view drawer is URL-driven (?view=<id>): a reload / shared link reopens it and closing
    // drops the param. Row clicks seed the cache for an instant open; "view profile" jumps by id.
    const qc = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    // Only a real record id opens the drawer: Number('abc') is NaN, which passes an
    // `!= null` guard and used to fetch /employees/NaN.
    const openId = toRecordId(searchParams.get('view'));
    const { data: viewEmp, isError: viewEmpMissing } = useEmployee(openId);
    const setView = (id: number | null) =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                if (id == null) {
                    p.delete('view');
                } else {
                    p.set('view', String(id));
                }
                return p;
            },
            { replace: true },
        );
    const openEmp = (emp: Employee) => {
        qc.setQueryData(['employee', emp.id], emp);
        setView(emp.id);
    };
    const closeEmp = () => setView(null);

    // The add-employee drawer is URL-driven (?add=1) so a reload / shared link reopens it.
    const adding = searchParams.get('add') != null;
    const openAdd = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('add', '1');
                return p;
            },
            { replace: true },
        );
    const closeAdd = () =>
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.delete('add');
                return p;
            },
            { replace: true },
        );

    // Legacy deep-link ?highlight=<id> → convert once to ?view=<id> on the Directory tab.
    const highlightId = searchParams.get('highlight');
    useEffect(() => {
        if (!highlightId) return;
        setSearchParams(
            (sp) => {
                const p = new URLSearchParams(sp);
                p.set('tab', 'directory');
                p.set('view', highlightId);
                p.delete('highlight');
                return p;
            },
            { replace: true },
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightId]);

    // Switch tab and mirror it in the URL (?tab=) so reloads / shared links stay put.
    const changeTab = useCallback(
        (next: Tab) => {
            setTab(next);
            setSearchParams(
                (prev) => {
                    const sp = new URLSearchParams(prev);
                    sp.set('tab', next);
                    return sp;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    // The Directory badge counts active staff still waiting for a login account — work left to do,
    // not a headcount — so it is tinted amber and hidden once everyone has one.
    const tabs: TabItem[] = [
        canViewDashboard && { id: 'dashboard' as Tab, label: t('sub_dashboard') },
        canViewDirectory && {
            id: 'directory' as Tab,
            label: t('sub_directory'),
            count: summary?.no_account || undefined,
            countTitle: t('cred_no_account'),
        },
        canViewSections && { id: 'sections' as Tab, label: t('sub_sections') },
        canViewDepartments && { id: 'departments' as Tab, label: t('sub_departments') },
        canViewPositions && { id: 'positions' as Tab, label: t('sub_positions') },
        canViewOrg && { id: 'orgchart' as Tab, label: t('sub_org_chart') },
    ].filter(Boolean) as TabItem[];

    // If the persisted/landing tab isn't visible (permission removed), fall back to first visible tab.
    useEffect(() => {
        if (tabs.length > 0 && !tabs.some((tb) => tb.id === tab)) {
            changeTab(tabs[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs.map((tb) => tb.id).join(',')]);

    // A position can only be deleted when no employee holds it; otherwise show a notice.
    const handleDeletePos = (p: Position) => {
        const members = p.employees_count ?? 0;
        if (members > 0) {
            confirm({
                variant: 'warn',
                hideCancel: true,
                title: t('pos_del_blocked_title'),
                description: t('pos_del_blocked_desc'),
                entity: { name: p.title, sub: `${members} ${t('dept_members')}` },
                confirmText: t('got_it'),
            });
            return;
        }
        confirm({
            variant: 'danger',
            entity: { name: p.title },
            action: () => positionMut.remove.mutateAsync(p.id),
        });
    };

    const posColumns: Column<Position>[] = [
        { key: 'code', header: t('pos_code'), render: (p) => <span className="text-muted-foreground font-mono text-xs">{p.code}</span> },
        { key: 'title', header: t('pos_title'), render: (p) => <span className="font-medium">{p.title}</span> },
        {
            key: 'members',
            header: t('dept_members'),
            align: 'right',
            render: (p) => (
                <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs">
                    <Users className="text-muted-foreground h-3.5 w-3.5" />
                    {p.employees_count ?? 0}
                </span>
            ),
        },
        {
            key: 'allow_special',
            header: (
                <span className="inline-flex items-center gap-1">
                    {t('pos_allow_special')}
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground inline-flex"
                                    aria-label={t('pos_allow_special')}
                                >
                                    <Info className="h-3.5 w-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-left font-normal normal-case">{t('pos_allow_special_info')}</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </span>
            ),
            align: 'center',
            // Quick per-position toggle — stop row-click (opens members) from firing.
            render: (p) => (
                <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <Switch
                        checked={p.allow_special_position}
                        disabled={!canPosSpecial || positionMut.update.isPending}
                        onChange={(next) =>
                            confirm({
                                variant: 'warn',
                                title: t('pos_allow_special'),
                                description: next ? t('pos_allow_special_confirm_on') : t('pos_allow_special_confirm_off'),
                                entity: { name: p.title },
                                action: () => positionMut.update.mutateAsync({ id: p.id, title: p.title, allow_special_position: next }),
                            })
                        }
                        aria-label={t('pos_allow_special')}
                    />
                </div>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (p) =>
                canPosEdit || canPosDelete ? (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canPosEdit && (
                            <button
                                onClick={() => {
                                    setEditPos(p);
                                    setPosModalOpen(true);
                                }}
                                className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <SquarePen className="h-4 w-4" />
                            </button>
                        )}
                        {canPosDelete && (
                            <button
                                onClick={() => handleDeletePos(p)}
                                className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    // A department can only be deleted when it has no employees AND no sections.
    // Otherwise show a blocking notice (sections cascade-delete, employees unassign).
    const handleDeleteDept = (d: Department) => {
        const members = d.count ?? 0;
        const sections = d.sections_count ?? 0;
        if (members > 0 || sections > 0) {
            confirm({
                variant: 'warn',
                hideCancel: true,
                title: t('dept_del_blocked_title'),
                description: t('dept_del_blocked_desc'),
                entity: {
                    name: lang === 'th' ? (d.name_th ?? d.name) : d.name,
                    sub: `${members} ${t('dept_members')} · ${sections} ${t('sub_sections')}`,
                },
                confirmText: t('got_it'),
            });
            return;
        }
        confirm({
            variant: 'danger',
            entity: { name: lang === 'th' ? (d.name_th ?? d.name) : d.name },
            action: () => departmentMut.remove.mutateAsync(d.id),
        });
    };

    const deptColumns: Column<Department>[] = [
        { key: 'code', header: t('section_code'), render: (d) => <span className="text-muted-foreground font-mono text-xs">{d.code}</span> },
        { key: 'tag', header: t('dept_code'), render: (d) => <span className="bg-muted rounded-md px-2 py-0.5 font-mono text-xs">{d.tag}</span> },
        {
            key: 'name',
            header: t('department'),
            render: (d) => <span className="font-medium">{lang === 'th' ? (d.name_th ?? d.name) : d.name}</span>,
        },
        {
            key: 'sections',
            header: t('sub_sections'),
            align: 'right',
            render: (d) => (
                <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs">
                    <Layers className="text-muted-foreground h-3.5 w-3.5" />
                    {d.sections_count ?? 0}
                </span>
            ),
        },
        {
            key: 'members',
            header: t('dept_members'),
            align: 'right',
            render: (d) => (
                <span className="inline-flex items-center justify-end gap-1.5 font-mono text-xs">
                    <Users className="text-muted-foreground h-3.5 w-3.5" />
                    {d.count ?? 0}
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (d) =>
                canDeptEdit || canDeptDelete ? (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canDeptEdit && (
                            <button
                                onClick={() => {
                                    setEditDept(d);
                                    setDeptModalOpen(true);
                                }}
                                className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <SquarePen className="h-4 w-4" />
                            </button>
                        )}
                        {canDeptDelete && (
                            <button
                                onClick={() => handleDeleteDept(d)}
                                className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
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
                    <p className="text-muted-foreground text-sm">{t('emp_subtitle')}</p>
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
                            <Button onClick={openAdd}>
                                <Plus className="h-4 w-4" />
                                {t('add_employee')}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <Card className="overflow-hidden">
                <div className="border-border flex flex-wrap gap-1 border-b px-3 pt-1">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => changeTab(tb.id)}
                            className={cn(
                                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab === tb.id ? 'border-brand text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && (
                                <span
                                    title={tb.countTitle}
                                    className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 font-mono text-xs text-amber-600 dark:text-amber-400"
                                >
                                    {tb.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {tab === 'dashboard' && summaryLoading && <EmployeeDashboardSkeleton />}
                    {tab === 'dashboard' && !summaryLoading && (
                        <Dashboard
                            summary={summary}
                            departments={departments}
                            positions={positions}
                            onViewDepartments={() => changeTab('departments')}
                        />
                    )}

                    {tab === 'directory' && (
                        <DirectoryTab
                            departments={departments}
                            canEdit={canEdit}
                            isSuperViewer={isSuper}
                            canResetPassword={canResetPassword}
                            canResign={canResign}
                            canCancelResign={canCancelResign}
                            canSetCredentials={canSetCredentials}
                            onView={openEmp}
                            onEdit={setEditEmp}
                            onResign={setResignEmp}
                            onCancelResign={async (e) => {
                                await confirm({
                                    variant: 'warn',
                                    description: t('cancel_resign_confirm'),
                                    action: () => employeeMut.cancelResign.mutateAsync(e.id),
                                });
                            }}
                            onResetPassword={setResetPwEmp}
                            onSetCredentials={setCredEmp}
                        />
                    )}

                    {tab === 'positions' && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-muted-foreground text-sm">{t('pos_all_org')}</span>
                                {canPosAdd && (
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
                            <DataTable columns={posColumns} rows={positions} rowKey={(p) => p.id} onRowClick={(p) => setViewPos(p)} />
                        </div>
                    )}

                    {tab === 'departments' && (
                        <DataTable
                            columns={deptColumns}
                            rows={departments}
                            rowKey={(d) => d.id}
                            onRowClick={(d) => setViewDept(d)}
                            searchable={(d) => `${d.code} ${d.tag} ${d.name} ${d.name_th ?? ''}`}
                            actions={
                                canDeptAdd && (
                                    <Button
                                        onClick={() => {
                                            setEditDept(null);
                                            setDeptModalOpen(true);
                                        }}
                                    >
                                        <Plus className="h-4 w-4" />
                                        {t('add_department')}
                                    </Button>
                                )
                            }
                        />
                    )}

                    {tab === 'sections' && <SectionsTab canAdd={canSectionAdd} canEdit={canSectionEdit} canDelete={canSectionDelete} />}

                    {tab === 'orgchart' && <OrgChartTab />}
                </div>
            </Card>

            <AddEmployeeDrawer open={adding} onClose={closeAdd} />
            <EditEmployeeDialog open={!!editEmp} onClose={() => setEditEmp(null)} employee={editEmp} />
            <ImportEmployeeDialog open={importOpen} onClose={() => setImportOpen(false)} />
            {/* The drawer bails out on a null record, so a dead ?view= link had nothing to
                render and said nothing. This says it instead. */}
            <RecordMissingDialog open={viewEmpMissing} onClose={() => closeEmp()} />
            <EmployeeViewDrawer
                employee={viewEmp ?? null}
                onClose={() => closeEmp()}
                canEdit={canEdit}
                isSuperViewer={isSuper}
                canResetPassword={canResetPassword}
                canResign={canResign}
                canCancelResign={canCancelResign}
                canSetCredentials={canSetCredentials}
                onResign={(e) => setResignEmp(e)}
                onCancelResign={async (e) => {
                    await confirm({
                        variant: 'warn',
                        description: t('cancel_resign_confirm'),
                        action: async () => {
                            await employeeMut.cancelResign.mutateAsync(e.id);
                            closeEmp();
                        },
                    });
                }}
                onResetPassword={(e) => setResetPwEmp(e)}
                // Keep the view dialog open so the credentials modal stacks on top of it.
                onSetCredentials={(e) => setCredEmp(e)}
                // Keep the view dialog open so the edit dialog stacks on top (closing it returns here).
                onEdit={setEditEmp}
                onViewProfile={setView}
            />
            <ResignModal
                employee={resignEmp}
                onClose={() => setResignEmp(null)}
                onDone={() => {
                    setResignEmp(null);
                    closeEmp();
                }}
            />
            <ManageCredentialsModal employee={resetPwEmp} onClose={() => setResetPwEmp(null)} />
            <SetCredentialsModal employee={credEmp} onClose={() => setCredEmp(null)} />
            <PositionModal open={posModalOpen} onClose={() => setPosModalOpen(false)} position={editPos} />
            <DepartmentModal open={deptModalOpen} onClose={() => setDeptModalOpen(false)} department={editDept} />
            <DepartmentMembersDialog department={viewDept} onClose={() => setViewDept(null)} />
            <PositionMembersDialog position={viewPos} onClose={() => setViewPos(null)} />
        </div>
    );
}

const DIR_PAGE_SIZES = [20, 50, 100] as const;

interface DirectoryTabProps {
    departments: Department[];
    canEdit: boolean;
    isSuperViewer: boolean;
    canResetPassword: boolean;
    canResign: boolean;
    canCancelResign: boolean;
    canSetCredentials: boolean;
    onView: (e: Employee) => void;
    onEdit: (e: Employee) => void;
    onResign: (e: Employee) => void;
    onCancelResign: (e: Employee) => void;
    onResetPassword: (e: Employee) => void;
    onSetCredentials: (e: Employee) => void;
}

function DirectoryTab({
    departments,
    canEdit,
    isSuperViewer,
    canResetPassword,
    canResign,
    canCancelResign,
    canSetCredentials,
    onView,
    onEdit,
    onResign,
    onCancelResign,
    onResetPassword,
    onSetCredentials,
}: DirectoryTabProps) {
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

    const handleSearch = (v: string) => {
        setSearch(v);
        setPage(1);
    };
    const handleDept = (v: string) => {
        setDeptFilter(v);
        setPage(1);
    };
    const handleStatus = (v: string) => {
        setStatusFilter(v);
        setPage(1);
    };
    const handlePageSize = (v: 10 | 20 | 50 | 100) => {
        setPageSize(v);
        setPage(1);
    };

    const columns: Column<Employee>[] = [
        {
            key: 'name',
            header: t('sub_directory'),
            render: (e) => (
                <div className="flex items-center gap-2.5">
                    <UserAvatar name={e.name} photoUrl={e.photo_url} />
                    <div className="font-medium">{lang === 'th' ? (e.name_th ?? e.name) : e.name}</div>
                </div>
            ),
        },
        { key: 'code', header: t('tbl_emp_id'), render: (e) => <span className="font-mono text-xs">{e.code}</span> },
        { key: 'position', header: t('position'), render: (e) => e.position ?? '—' },
        { key: 'department', header: t('department'), render: (e) => (lang === 'th' ? (e.department_th ?? e.department) : e.department) ?? '—' },
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
                            <button className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md">
                                <MoreVertical className="h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onView(e)}>
                                <Eye className="h-4 w-4" />
                                {t('view')}
                            </DropdownMenuItem>
                            {canEdit &&
                                e.status !== 'resigned' &&
                                (e.is_super_admin && !isSuperViewer ? (
                                    <DropdownMenuItem disabled title={t('emp_admin_protected')}>
                                        <SquarePen className="h-4 w-4" />
                                        {t('edit')}
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem onClick={() => onEdit(e)}>
                                        <SquarePen className="h-4 w-4" />
                                        {t('edit')}
                                    </DropdownMenuItem>
                                ))}
                            {canSetCredentials && !e.has_account && e.status !== 'resigned' && (
                                <DropdownMenuItem onClick={() => onSetCredentials(e)}>
                                    <ShieldCheck className="h-4 w-4" />
                                    {t('emp_set_credentials')}
                                </DropdownMenuItem>
                            )}
                            {(canResetPassword || canSetCredentials) && e.has_account && (
                                <DropdownMenuItem onClick={() => onResetPassword(e)}>
                                    <KeyRound className="h-4 w-4" />
                                    {t('emp_cred_manage_title')}
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
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder={t('search_name_id')} className="pl-9" />
                </div>
                <Select value={deptFilter} onValueChange={handleDept}>
                    <SelectTrigger className="w-56">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('all_departments')}</SelectItem>
                        {departments.map((d) => (
                            <SelectItem key={d.id} value={String(d.id)}>
                                {lang === 'th' ? (d.name_th ?? d.name) : d.name}
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
                                <span className="bg-muted-foreground h-2 w-2 shrink-0 rounded-full" />
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

            {isLoading ? (
                <TableSkeleton rows={pageSize > 20 ? 8 : 5} cols={7} />
            ) : (
                <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={onView} hidePagination />
            )}

            {/* Pagination bar */}
            <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                <div className="flex items-center gap-2">
                    <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                    <Select value={String(pageSize)} onValueChange={(v) => handlePageSize(Number(v) as 10 | 20 | 50 | 100)}>
                        <SelectTrigger className="h-8 w-[72px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DIR_PAGE_SIZES.map((s) => (
                                <SelectItem key={s} value={String(s)}>
                                    {s}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-3">
                    <span>
                        {from}–{to} {lang === 'th' ? 'จาก' : 'of'} {total}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-foreground px-1 font-medium">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import type { EmployeeSummary } from '../api/employeeApi';

const DASH_DEPT_LIMIT = 8;

/** Pulse skeleton mirroring the dashboard (KPI row + trend + two 2-col grids) while the summary loads. */
function EmployeeDashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                            <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" />
                        </div>
                        <div className="bg-muted mt-3 h-8 w-14 animate-pulse rounded" />
                    </Card>
                ))}
            </div>
            <Card className="overflow-hidden">
                <div className="border-border border-b px-5 py-3.5">
                    <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                </div>
                <div className="flex h-[172px] items-end gap-2.5 p-5">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="bg-muted flex-1 animate-pulse rounded-t-md" style={{ height: `${25 + ((i * 37) % 70)}%` }} />
                    ))}
                </div>
            </Card>
            {Array.from({ length: 2 }).map((_, g) => (
                <div key={g} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Card key={i} className="overflow-hidden">
                            <div className="border-border border-b px-5 py-3.5">
                                <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                            </div>
                            <div className="space-y-2.5 p-5">
                                {Array.from({ length: 5 }).map((_, r) => (
                                    <div key={r} className="bg-muted h-8 w-full animate-pulse rounded" />
                                ))}
                            </div>
                        </Card>
                    ))}
                </div>
            ))}
        </div>
    );
}

function Dashboard({
    summary,
    departments,
    positions,
    onViewDepartments,
}: {
    summary: EmployeeSummary | undefined;
    departments: Department[];
    positions: Position[];
    onViewDepartments: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const kpis = [
        { label: t('total_employees'), value: summary?.total ?? '—', icon: Users, tone: 'text-brand bg-brand/10' },
        { label: t('departments_count'), value: departments.length, icon: Building2, tone: 'text-brand bg-brand/10' },
        { label: t('active_positions'), value: positions.length, icon: Briefcase, tone: 'text-brand bg-brand/10' },
        { label: t('new_hires'), value: summary?.new_hires ?? '—', icon: UserPlus, tone: 'text-brand bg-brand/10' },
    ];

    // Employee-status split (active vs resigned) for the status card's bar.
    const total = summary?.total ?? 0;
    const statusPct = {
        active: total ? Math.round(((summary?.active ?? 0) / total) * 100) : 0,
        resigned: total ? Math.round(((summary?.resigned ?? 0) / total) * 100) : 0,
    };
    const currentYear = new Date().getFullYear();

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {kpis.map((k) => {
                    const Icon = k.icon;
                    return (
                        <Card key={k.label} className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="text-muted-foreground text-sm">{k.label}</div>
                                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', k.tone)}>
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                            </div>
                            <div className="mt-2 font-mono text-3xl font-bold">{k.value}</div>
                        </Card>
                    );
                })}
            </div>
            <HiresTrendCard data={summary?.hires_by_month ?? []} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Employee status — active vs resigned */}
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <UserCheck className="text-muted-foreground h-4 w-4" />
                            {t('emp_status_title')}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            <b className="text-foreground font-mono font-bold">{summary?.total ?? 0}</b> {t('emp_people')}
                        </span>
                    </div>
                    <div className="p-5">
                        <div className="flex items-baseline gap-2.5">
                            <span className="font-mono text-[54px] leading-none font-bold">{summary?.active ?? 0}</span>
                            <span className="text-muted-foreground text-sm">
                                {t('emp_status_caption').replace('{n}', String(summary?.total ?? 0))}
                            </span>
                        </div>
                        <div className="bg-secondary my-4 flex h-3 w-full overflow-hidden rounded-full">
                            <span className="bg-brand block h-full" style={{ width: `${statusPct.active}%` }} />
                            <span className="bg-destructive block h-full" style={{ width: `${statusPct.resigned}%` }} />
                        </div>
                        <div className="flex gap-5">
                            <span className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                                <i className="bg-brand h-2.5 w-2.5 rounded-full" />
                                {t('emp_status_active')} <b className="text-foreground font-mono font-semibold">{summary?.active ?? 0}</b>
                            </span>
                            <span className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                                <i className="bg-destructive h-2.5 w-2.5 rounded-full" />
                                {t('emp_status_resigned')} <b className="text-foreground font-mono font-semibold">{summary?.resigned ?? 0}</b>
                            </span>
                        </div>
                        <div className="border-border mt-4 flex items-center gap-3 border-t border-dashed pt-3.5">
                            <span className="text-destructive font-mono text-[32px] leading-none font-bold">{summary?.resigned_this_year ?? 0}</span>
                            <span className="text-muted-foreground text-[12.5px]">{t('emp_resigned_year').replace('{y}', String(currentYear))}</span>
                        </div>
                    </div>
                </Card>

                {/* Recent resignations */}
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <UserMinus className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-semibold">{t('emp_recent_resignations')}</span>
                    </div>
                    <div className="max-h-[20rem] space-y-1 overflow-y-auto p-4">
                        {(summary?.recent_resignations ?? []).length === 0 ? (
                            <div className="text-muted-foreground py-10 text-center text-sm">{t('emp_no_resignations')}</div>
                        ) : (
                            (summary?.recent_resignations ?? []).map((e) => (
                                <div key={e.id} className="border-border/60 flex items-center gap-3 border-b py-2 last:border-0">
                                    <UserAvatar name={e.name} photoUrl={e.photo_url} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{lang === 'th' ? (e.name_th ?? e.name) : e.name}</div>
                                        <div className="text-muted-foreground truncate text-xs">
                                            {e.position} · {lang === 'th' ? (e.department_th ?? e.department) : e.department}
                                        </div>
                                    </div>
                                    <span className="text-muted-foreground font-mono text-xs">{e.last_day}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <Building2 className="text-muted-foreground h-4 w-4" />
                            {t('headcount_by_dept')}
                        </span>
                        {departments.length > DASH_DEPT_LIMIT && (
                            <button onClick={onViewDepartments} className="text-brand text-xs font-medium hover:underline">
                                {t('view_all')}
                            </button>
                        )}
                    </div>
                    <div className="divide-border/60 divide-y px-5">
                        {[...departments]
                            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
                            .slice(0, DASH_DEPT_LIMIT)
                            .map((d) => (
                                <div key={d.id} className="flex items-center justify-between py-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className="bg-muted rounded-md px-2 py-0.5 font-mono text-[11px]">{d.tag}</span>
                                        <span className="text-sm">{lang === 'th' ? (d.name_th ?? d.name) : d.name}</span>
                                    </div>
                                    <span className="font-mono text-sm font-semibold">{d.count ?? 0}</span>
                                </div>
                            ))}
                    </div>
                </Card>
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                        <UserPlus className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-semibold">{t('recent_hires')}</span>
                    </div>
                    <div className="max-h-[22rem] space-y-1 overflow-y-auto p-4">
                        {(summary?.recent ?? []).map((e) => (
                            <div key={e.id} className="border-border/60 flex items-center gap-3 border-b py-2 last:border-0">
                                <UserAvatar name={e.name} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{lang === 'th' ? (e.name_th ?? e.name) : e.name}</div>
                                    <div className="text-muted-foreground truncate text-xs">
                                        {e.position} · {lang === 'th' ? (e.department_th ?? e.department) : e.department}
                                    </div>
                                </div>
                                <span className="text-muted-foreground font-mono text-xs">{e.joined_at}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}
