import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Column, DataTable } from '@/shared/components/data-table';
import { EmptyState } from '@/shared/components/empty-state';
import { FilterPopover } from '@/shared/components/filter-popover';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import {
    OverviewHeader,
    periodReachesToday,
    useOverviewPeriod,
    usePeriodWords,
    useShownPeriod,
    type OverviewPeriod,
} from '@/shared/components/overview-period';
import { PageTabs, type PageTab } from '@/shared/components/page-tabs';
import { RecordMissingDialog } from '@/shared/components/record-missing';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { StatCard } from '@/shared/components/stat-card';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { TruncText } from '@/shared/components/trunc-text';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useDateColumnWidth } from '@/shared/hooks/use-date-column-width';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useListParams } from '@/shared/hooks/use-list-params';
import { usePageDialogs } from '@/shared/hooks/use-page-dialogs';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { localName, localPair } from '@/shared/lib/local-name';
import { rowDelay } from '@/shared/lib/row-in';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn, toRecordId } from '@/shared/lib/utils';
import type { Department, Employee, Position } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
    Briefcase,
    Building2,
    CircleDot,
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
import { useEffect, useId, useState } from 'react';
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
import { accountDeleteRefusal } from '../lib/delete-account';

const TAB_IDS = ['overview', 'directory', 'positions', 'departments', 'sections', 'orgchart'] as const;
type Tab = (typeof TAB_IDS)[number];

const isTab = (v: string | null): v is Tab => (TAB_IDS as readonly string[]).includes(v ?? '');

// List keys shared by the tabs; cleared when the tab changes (rows-per-page stays).
const LIST_KEYS = ['search', 'dept', 'status', 'sort', 'page'];
const clearListKeys = (params: URLSearchParams) => LIST_KEYS.forEach((key) => params.delete(key));

// Icon-only row action buttons
const ICON_BTN =
    'hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none';
const ICON_BTN_DANGER = cn(ICON_BTN, 'text-destructive hover:bg-destructive/10');

/** One entry on the sub-tab bar; `count` renders as a small badge with `countTitle` as its tooltip. */
type TabItem = PageTab<Tab>;

export default function EmployeesPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { can, isSuper } = useAuth();
    const canAdd = can('employees.add');
    const canImport = can('employees.import');
    const canEdit = can('employees.edit');
    const canResetPassword = can('employees.reset_password');
    const canResign = can('employees.resign');
    const canCancelResign = can('employees.cancel_resign');
    const canDelete = can('employees.delete');
    const canSetCredentials = can('employees.set_credentials');

    const canViewOverview = can('employees.view_dashboard');
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

    // The tab lives in ?tab= (useTabParam): reloads / shared links are exact, Back steps through tabs.
    const [tab, setTab] = useTabParam(isTab, 'overview');
    const [period, setPeriod] = useOverviewPeriod();
    const {
        data: summary,
        isLoading: summaryLoading,
        isError: summaryFailed,
        isPlaceholderData: summaryStale,
        refetch: refetchSummary,
    } = useEmployeeSummary(period);
    const summaryPeriod = useShownPeriod(period, summaryStale);
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

    /** Erase a record typed in by mistake; the confirm names the login account that goes with it. */
    const askDeleteEmployee = async (e: Employee) => {
        await confirm({
            variant: 'danger',
            title: t('emp_delete_title'),
            entity: { name: e.name, sub: e.code },
            description: t(e.has_account ? 'emp_delete_confirm_account' : 'emp_delete_confirm'),
            confirmText: t('delete'),
            action: async () => {
                await employeeMut.remove.mutateAsync(e.id);
                closeEmp();
            },
            errorMessage: (err) => {
                const refusal = accountDeleteRefusal(err);
                return refusal ? t(`emp_del_block_${refusal}`) : undefined;
            },
        });
    };

    // View drawer in ?view=<id>; row clicks seed the cache for an instant open
    const qc = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();
    // Opening pushes a history entry so Back closes the drawer
    const dialogs = usePageDialogs();
    // Only a real record id opens the drawer (never NaN)
    const openId = toRecordId(searchParams.get('view'));
    const { data: viewEmp, isError: viewEmpMissing } = useEmployee(openId);
    const setView = (id: number | null) => (id == null ? dialogs.close(['view', 'edit']) : dialogs.open({ view: String(id) }));
    const openEmp = (emp: Employee) => {
        qc.setQueryData(['employee', emp.id], emp);
        setView(emp.id);
    };
    const closeEmp = () => setView(null);
    // A profile link inside the drawer swaps the person in place, so its close button still closes the drawer
    const swapView = (id: number) => dialogs.replace((p) => p.set('view', String(id)));

    // Edit lives in ?edit=<id>: from the row menu the form opens alone, from the view ?view stays under it
    const editId = toRecordId(searchParams.get('edit'));
    const { data: editSource, isError: editMissing, isFetching: editFetching } = useEmployee(editId);
    // Not cleared when ?edit goes: the copy stays for the closing animation, and the row's copy survives the URL lagging a render
    useEffect(() => {
        if (editId != null && editSource && !editFetching && editEmp?.id !== editId) setEditEmp(editSource);
    }, [editId, editSource, editFetching, editEmp?.id]);
    // A link or reload cannot open a form the menus would not offer
    const editOpen = editEmp != null && editEmp.id === editId && canEdit && editEmp.status !== 'resigned' && (!editEmp.is_super_admin || isSuper);
    // The clicked row opens the form at once; a link or reload fetches it
    const openEditEmp = (emp: Employee) => {
        setEditEmp(emp);
        dialogs.open({ edit: String(emp.id) });
    };
    const closeEditEmp = () => dialogs.close(['edit']);
    // A saved edit always lands on the employee's view: back to it when it is underneath, else in place
    const showSavedEmp = () => {
        if (editId != null && searchParams.get('view') === String(editId)) {
            dialogs.close(['edit']);
            return;
        }
        dialogs.replace(
            (p) => {
                p.delete('edit');
                if (editId != null) p.set('view', String(editId));
            },
            ['view'],
        );
    };

    // The add-employee drawer is URL-driven (?add=1) so a reload / shared link reopens it.
    const adding = searchParams.get('add') != null;
    const openAdd = () => dialogs.open({ add: '1' });
    const closeAdd = () => dialogs.close(['add']);

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

    // Switch tab and mirror it in the URL (?tab=); the new tab starts unfiltered on page 1.
    const changeTab = (next: Tab) => {
        if (next === tab) return;
        setTab(next, { extra: clearListKeys });
    };
    // Positions / Departments tables: search, page and rows-per-page in the URL (?search, page, per).
    const list = useListParams();

    // Directory badge: active staff still without a login account (amber, hidden at zero)
    const tabs: TabItem[] = [
        canViewOverview && { id: 'overview' as Tab, label: t('sub_overview') },
        canViewDirectory && {
            id: 'directory' as Tab,
            label: t('sub_directory'),
            count: summary?.no_account || undefined,
            tone: 'warn' as const,
            countTitle: t('cred_no_account'),
        },
        canViewSections && { id: 'sections' as Tab, label: t('sub_sections') },
        canViewDepartments && { id: 'departments' as Tab, label: t('sub_departments') },
        canViewPositions && { id: 'positions' as Tab, label: t('sub_positions') },
        canViewOrg && { id: 'orgchart' as Tab, label: t('sub_org_chart') },
    ].filter(Boolean) as TabItem[];

    // A landing tab the reader can't see falls back to the first visible one (replace)
    useEffect(() => {
        if (tabs.length > 0 && !tabs.some((tb) => tb.id === tab)) {
            setTab(tabs[0].id, { replace: true, extra: clearListKeys });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs.map((tb) => tb.id).join(','), tab]);

    // A position can only be deleted when no employee holds it; otherwise show a notice.
    const handleDeletePos = (p: Position) => {
        const members = p.employees_count ?? 0;
        if (members > 0) {
            confirm({
                variant: 'warn',
                hideCancel: true,
                title: t('pos_del_blocked_title'),
                description: t('pos_del_blocked_desc'),
                entity: { name: p.title, sub: `${fmtN(members)} ${t('dept_members')}` },
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
        { key: 'code', header: t('pos_code'), render: (p) => <span className="text-muted-foreground text-xs">{p.code}</span> },
        { key: 'title', header: t('pos_title'), render: (p) => <span className="font-medium">{p.title}</span> },
        {
            key: 'members',
            header: t('dept_members'),
            align: 'right',
            render: (p) => (
                <span className="inline-flex items-center justify-end gap-1.5 text-xs">
                    <Users className="text-muted-foreground h-3.5 w-3.5" />
                    {fmtN(p.employees_count ?? 0)}
                </span>
            ),
        },
        {
            key: 'allow_special',
            header: (
                <span className="inline-flex items-center gap-1">
                    {t('pos_allow_special')}
                    {/* Opens on tap or click; portalled so the table edge never clips it */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex rounded-full focus-visible:ring-2 focus-visible:outline-none"
                                aria-label={t('pos_allow_special')}
                            >
                                <Info className="h-3.5 w-3.5" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent className="max-w-xs text-xs leading-relaxed font-normal tracking-normal normal-case">
                            {t('pos_allow_special_info')}
                        </PopoverContent>
                    </Popover>
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
                                type="button"
                                onClick={() => {
                                    setEditPos(p);
                                    setPosModalOpen(true);
                                }}
                                aria-label={`${t('edit')} ${p.title}`}
                                className={ICON_BTN}
                            >
                                <SquarePen aria-hidden className="h-4 w-4" />
                            </button>
                        )}
                        {canPosDelete && (
                            <button
                                type="button"
                                onClick={() => handleDeletePos(p)}
                                aria-label={`${t('delete')} ${p.title}`}
                                className={ICON_BTN_DANGER}
                            >
                                <Trash2 aria-hidden className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    const deptName = (d: Department) => localName(d, lang);

    // A department is deletable only with no employees and no sections; otherwise a notice
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
                    name: deptName(d),
                    sub: `${fmtN(members)} ${t('dept_members')}, ${fmtN(sections)} ${t('sub_sections')}`,
                },
                confirmText: t('got_it'),
            });
            return;
        }
        confirm({
            variant: 'danger',
            entity: { name: deptName(d) },
            action: () => departmentMut.remove.mutateAsync(d.id),
        });
    };

    const deptColumns: Column<Department>[] = [
        { key: 'code', header: t('section_code'), render: (d) => <span className="text-muted-foreground text-xs">{d.code}</span> },
        { key: 'tag', header: t('dept_code'), render: (d) => <span className="bg-muted rounded-md px-2 py-0.5 text-xs">{d.tag}</span> },
        {
            key: 'name',
            header: t('department'),
            render: (d) => <span className="font-medium">{deptName(d)}</span>,
        },
        {
            key: 'sections',
            header: t('sub_sections'),
            align: 'right',
            render: (d) => (
                <span className="inline-flex items-center justify-end gap-1.5 text-xs">
                    <Layers className="text-muted-foreground h-3.5 w-3.5" />
                    {fmtN(d.sections_count ?? 0)}
                </span>
            ),
        },
        {
            key: 'members',
            header: t('dept_members'),
            align: 'right',
            render: (d) => (
                <span className="inline-flex items-center justify-end gap-1.5 text-xs">
                    <Users className="text-muted-foreground h-3.5 w-3.5" />
                    {fmtN(d.count ?? 0)}
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
                                type="button"
                                onClick={() => {
                                    setEditDept(d);
                                    setDeptModalOpen(true);
                                }}
                                aria-label={`${t('edit')} ${deptName(d)}`}
                                className={ICON_BTN}
                            >
                                <SquarePen aria-hidden className="h-4 w-4" />
                            </button>
                        )}
                        {canDeptDelete && (
                            <button
                                type="button"
                                onClick={() => handleDeleteDept(d)}
                                aria-label={`${t('delete')} ${deptName(d)}`}
                                className={ICON_BTN_DANGER}
                            >
                                <Trash2 aria-hidden className="h-4 w-4" />
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
            <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
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

            <Card className="overflow-clip">
                <PageTabs tabs={tabs} active={tab} onChange={changeTab} />

                <div className="p-5">
                    {tab === 'overview' && <OverviewHeader value={period} onChange={setPeriod} />}
                    {tab === 'overview' && summaryLoading && <EmployeeOverviewSkeleton />}
                    {tab === 'overview' && !summaryLoading && !summary && summaryFailed && <LoadFailedPanel onRetry={() => refetchSummary()} />}
                    {tab === 'overview' && !summaryLoading && summary && (
                        <OverviewTab
                            summary={summary}
                            period={summaryPeriod}
                            highlightLast={periodReachesToday(period)}
                            departments={departments}
                            positions={positions}
                            onViewDepartments={() => changeTab('departments')}
                        />
                    )}

                    {tab === 'directory' && (
                        <DirectoryTab
                            departments={departments}
                            canAdd={canAdd}
                            canImport={canImport}
                            canEdit={canEdit}
                            isSuperViewer={isSuper}
                            canResetPassword={canResetPassword}
                            canResign={canResign}
                            canCancelResign={canCancelResign}
                            canSetCredentials={canSetCredentials}
                            onView={openEmp}
                            onEdit={openEditEmp}
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
                        <DataTable
                            columns={posColumns}
                            rows={positions}
                            rowKey={(p) => p.id}
                            onRowClick={(p) => setViewPos(p)}
                            searchPlaceholder={t('emp_positions_search')}
                            searchable={(p) => `${p.code} ${p.title}`}
                            search={list.table.search}
                            empty={
                                list.table.search.value
                                    ? { kind: 'search', title: t('emp_empty_positions_search'), hint: t('emp_empty_positions_search_hint') }
                                    : {
                                          kind: 'empty',
                                          title: t('emp_empty_positions'),
                                          hint: canPosAdd ? t('emp_empty_positions_hint').replace('{button}', t('add_position')) : null,
                                      }
                            }
                            paging={list.table.paging}
                            actions={
                                canPosAdd && (
                                    <Button
                                        onClick={() => {
                                            setEditPos(null);
                                            setPosModalOpen(true);
                                        }}
                                    >
                                        <Plus className="h-4 w-4" />
                                        {t('add_position')}
                                    </Button>
                                )
                            }
                        />
                    )}

                    {tab === 'departments' && (
                        <DataTable
                            columns={deptColumns}
                            rows={departments}
                            rowKey={(d) => d.id}
                            onRowClick={(d) => setViewDept(d)}
                            searchPlaceholder={t('emp_departments_search')}
                            searchable={(d) => `${d.code} ${d.tag} ${d.name} ${d.name_th ?? ''}`}
                            search={list.table.search}
                            empty={
                                list.table.search.value
                                    ? { kind: 'search', title: t('emp_empty_departments_search'), hint: t('emp_empty_departments_search_hint') }
                                    : {
                                          kind: 'empty',
                                          title: t('emp_empty_departments'),
                                          hint: canDeptAdd ? t('emp_empty_departments_hint').replace('{button}', t('add_department')) : null,
                                      }
                            }
                            paging={list.table.paging}
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
            <EditEmployeeDialog open={editOpen} onClose={closeEditEmp} onSaved={showSavedEmp} employee={editEmp} />
            <ImportEmployeeDialog open={importOpen} onClose={() => setImportOpen(false)} />
            {/* A dead ?view= link says so */}
            <RecordMissingDialog open={viewEmpMissing || editMissing} onClose={() => dialogs.close(['view', 'edit'])} />
            <EmployeeViewDrawer
                employee={viewEmp ?? null}
                onClose={() => closeEmp()}
                canEdit={canEdit}
                isSuperViewer={isSuper}
                canResetPassword={canResetPassword}
                canResign={canResign}
                canCancelResign={canCancelResign}
                canSetCredentials={canSetCredentials}
                canDelete={canDelete}
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
                onDelete={askDeleteEmployee}
                onResetPassword={(e) => setResetPwEmp(e)}
                // Keep the view dialog open so the credentials modal stacks on top of it.
                onSetCredentials={(e) => setCredEmp(e)}
                // Keep the view dialog open so the edit dialog stacks on top (closing it returns here).
                onEdit={openEditEmp}
                onViewProfile={swapView}
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

const DIR_STATUSES = ['active', 'has_account', 'no_account', 'resigned'] as const;
const isDirStatus = (v: string): v is (typeof DIR_STATUSES)[number] => (DIR_STATUSES as readonly string[]).includes(v);

interface DirectoryTabProps {
    departments: Department[];
    canAdd: boolean;
    canImport: boolean;
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
    canAdd,
    canImport,
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
    const fmt = useDateFormat();
    const dateWidth = useDateColumnWidth();
    const lang = useUiStore((s) => s.lang);
    // Search, filters, page and rows-per-page live in the URL (?search, dept, status, page, per).
    const list = useListParams();
    const search = list.get('search');
    const deptParam = list.get('dept');
    const deptKnown = departments.length === 0 ? /^\d+$/.test(deptParam) : departments.some((d) => String(d.id) === deptParam);
    const deptFilter = deptKnown ? deptParam : 'all';
    const statusParam = list.get('status');
    const statusFilter = isDirStatus(statusParam) ? statusParam : 'all';
    const { page, perPage } = list;
    const sentSearch = useDebouncedSearch(search);

    const { data, isLoading, isFetching, isPlaceholderData } = useEmployeeDirectory({
        page,
        per_page: perPage,
        search: sentSearch,
        department_id: deptFilter,
        status: statusFilter,
    });
    const rows = data?.data ?? [];
    const total = data?.meta?.total ?? 0;

    const handleSearch = (v: string) => list.setFilter('search', v);
    const handleDept = (v: string) => list.setFilter('dept', v === 'all' ? '' : v);
    const handleStatus = (v: string) => list.setFilter('status', v === 'all' ? '' : v);
    const activeFilterCount = (deptFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
    const clearFilters = () => list.setParams({ dept: null, status: null, page: null });

    const deptFieldId = useId();
    const statusFieldId = useId();
    const deptOptions = [
        { value: 'all', label: t('all_departments'), search: t('all_departments'), icon: <ToneDot tone="gray" /> },
        ...departments.map((d) => ({
            value: String(d.id),
            label: localName(d, lang),
            sub: d.tag,
            search: `${d.name} ${d.name_th ?? ''} ${d.tag}`,
        })),
    ];
    const statusOptions = [
        { value: 'all', label: t('all_status'), search: t('all_status'), icon: <ToneDot tone="gray" /> },
        { value: 'active', label: t('active'), search: t('active'), icon: <ToneDot tone="green" /> },
        { value: 'has_account', label: t('cred_has_account'), search: t('cred_has_account'), icon: <ToneDot tone="blue" /> },
        { value: 'no_account', label: t('cred_no_account'), search: t('cred_no_account'), icon: <ToneDot tone="amber" /> },
        { value: 'resigned', label: t('resigned'), search: t('resigned'), icon: <ToneDot tone="red" /> },
    ];

    const columns: Column<Employee>[] = [
        { key: 'code', header: t('tbl_emp_id'), width: '96px', sticky: 'left', className: 'text-xs whitespace-nowrap', render: (e) => e.code },
        {
            key: 'name',
            header: t('sub_directory'),
            minWidth: '14rem',
            render: (e) => (
                <div className="flex items-center gap-2.5">
                    <UserAvatar name={e.name} photoUrl={e.photo_url} />
                    <TruncText text={localName(e, lang)} className="font-medium" />
                </div>
            ),
        },
        { key: 'position', header: t('position'), width: '180px', render: (e) => <TruncText text={e.position} /> },
        {
            key: 'department',
            header: t('department'),
            width: '180px',
            render: (e) => <TruncText text={localPair(e.department, e.department_th, lang)} />,
        },
        { key: 'email', header: t('emp_email'), width: '220px', render: (e) => <TruncText text={e.email} className="text-xs" /> },
        { key: 'joined', header: t('joined'), width: dateWidth, className: 'text-xs whitespace-nowrap', render: (e) => fmt.date(e.joined_at) },
        {
            key: 'status',
            header: t('status'),
            width: '216px',
            className: 'whitespace-nowrap',
            render: (e) => (
                <div className="flex flex-nowrap items-center gap-1">
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
            header: <span className="sr-only">{t('actions')}</span>,
            width: '60px',
            align: 'right',
            render: (e) => (
                <div onClick={(ev) => ev.stopPropagation()} className="flex justify-end">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" aria-label={`${t('actions')} ${localName(e, lang)}`} className={ICON_BTN}>
                                <MoreVertical aria-hidden className="h-4 w-4" />
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
                                    <DropdownMenuItem disabled className="text-muted-foreground items-start data-disabled:opacity-100">
                                        <SquarePen className="mt-0.5 h-4 w-4" />
                                        <span className="flex min-w-0 flex-col">
                                            {t('edit')}
                                            <span className="max-w-56 text-xs">{t('emp_admin_protected')}</span>
                                        </span>
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
                                <DropdownMenuItem
                                    onClick={() => onCancelResign(e)}
                                    className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                                >
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
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-xs">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder={t('search_name_id')}
                        aria-label={searchLabel(t('search_name_id'))}
                        autoComplete="off"
                        spellCheck={false}
                        className="pl-9 text-ellipsis"
                    />
                </div>
                <FilterPopover count={activeFilterCount} width={460} onClear={clearFilters} resultCount={total}>
                    {() => (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor={deptFieldId} className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                    <Building2 className="h-3.5 w-3.5" />
                                    {t('department')}
                                </label>
                                <SearchableSelect
                                    id={deptFieldId}
                                    active={deptFilter !== 'all'}
                                    value={deptFilter}
                                    onChange={handleDept}
                                    options={deptOptions}
                                />
                            </div>
                            <div>
                                <label htmlFor={statusFieldId} className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                                    <CircleDot className="h-3.5 w-3.5" />
                                    {t('status')}
                                </label>
                                <SearchableSelect
                                    id={statusFieldId}
                                    active={statusFilter !== 'all'}
                                    value={statusFilter}
                                    onChange={handleStatus}
                                    options={statusOptions}
                                />
                            </div>
                        </div>
                    )}
                </FilterPopover>
            </div>

            <DataTable
                columns={columns}
                rows={rows}
                rowKey={(e) => e.id}
                onRowClick={onView}
                loading={isLoading || (isFetching && isPlaceholderData)}
                server={{ ...list.table.paging, total }}
                empty={
                    search || activeFilterCount > 0
                        ? { kind: 'search', title: t('emp_empty_directory_search'), hint: t('emp_empty_directory_search_hint') }
                        : {
                              kind: 'empty',
                              title: t('emp_empty_directory'),
                              hint: canAdd && canImport ? t('emp_empty_directory_hint').replace('{button}', t('add_employee')) : null,
                          }
                }
            />
        </div>
    );
}

import { useNumberFormat } from '@/shared/hooks/use-number-format';
import type { EmployeeSummary } from '../api/employeeApi';

const DASH_DEPT_LIMIT = 8;

/** Pulse skeleton mirroring the dashboard (KPI row + trend + two 2-col grids) while the summary loads. */
function EmployeeOverviewSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                            <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" />
                        </div>
                        <div className="bg-muted mt-3 h-8 w-14 animate-pulse rounded" />
                        <div className="bg-muted mt-2.5 h-3 w-24 animate-pulse rounded" />
                    </Card>
                ))}
            </div>
            <Card className="overflow-hidden">
                <div className={cn(CARD_HEADING, 'border-border border-b px-5 py-3.5')}>
                    <div className="bg-muted h-4 w-40 animate-pulse rounded" />
                </div>
                <div className="flex h-[172px] items-end gap-2.5 p-5">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="bg-muted flex-1 animate-pulse rounded-t-md" style={{ height: `${25 + ((i * 37) % 70)}%` }} />
                    ))}
                </div>
            </Card>
            {Array.from({ length: 2 }).map((_, g) => (
                <div key={g} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <Card key={i} className="overflow-hidden">
                            <div className={cn(CARD_HEADING, 'border-border border-b px-5 py-3.5')}>
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

function OverviewTab({
    summary,
    period,
    highlightLast,
    departments,
    positions,
    onViewDepartments,
}: {
    summary: EmployeeSummary | undefined;
    period: OverviewPeriod;
    highlightLast: boolean;
    departments: Department[];
    positions: Position[];
    onViewDepartments: () => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);
    const words = usePeriodWords();
    // "ใน 30 วันล่าสุด" style wording per period; all time counts everyone on record
    const periodWord = (days: string, all: string, range: string) =>
        typeof period === 'number' ? t(days).replace('{n}', fmtN(period)) : period === 'all' ? t(all) : t(range);

    const sectionTotal = departments.reduce((sum, d) => sum + (d.sections_count ?? 0), 0);
    const filledPositions = positions.filter((p) => (p.active_employees_count ?? 0) > 0).length;
    const kpis = [
        {
            label: t('total_employees'),
            value: String(summary?.total ?? '—'),
            icon: Users,
            sub: words.now(t('emp_kpi_total_sub').replace('{n}', fmtN(summary?.active ?? 0))),
        },
        {
            label: t('departments_count'),
            value: String(departments.length),
            icon: Building2,
            sub: words.now(t('emp_kpi_depts_sub').replace('{n}', fmtN(sectionTotal))),
        },
        {
            label: t('active_positions'),
            value: String(positions.length),
            icon: Briefcase,
            sub: words.now(t('emp_kpi_positions_sub').replace('{n}', fmtN(filledPositions))),
        },
        {
            label: t('new_hires'),
            value: String(summary?.new_hires ?? '—'),
            icon: UserPlus,
            sub: periodWord('emp_kpi_hires_days', 'emp_kpi_hires_all', 'emp_kpi_hires_range'),
        },
    ];

    // Employee-status split (active vs resigned) for the status card's bar.
    const total = summary?.total ?? 0;
    const statusPct = {
        active: total ? Math.round(((summary?.active ?? 0) / total) * 100) : 0,
        resigned: total ? Math.round(((summary?.resigned ?? 0) / total) * 100) : 0,
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {kpis.map((k) => (
                    <StatCard key={k.label} icon={k.icon} label={k.label} value={k.value} sub={k.sub} />
                ))}
            </div>
            <HiresTrendCard trend={summary?.hires_trend ?? { unit: 'month', data: [] }} highlightLast={highlightLast} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Employee status — active vs resigned */}
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-5 py-3.5')}>
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <UserCheck className="text-muted-foreground h-4 w-4" />
                            {t('emp_status_title')}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            <b className="text-foreground font-bold">{summary?.total ?? 0}</b> {t('emp_people')}
                        </span>
                    </div>
                    <div className="p-5">
                        <div className="flex items-baseline gap-2.5">
                            <span className="text-[54px] leading-none font-bold">{fmtN(summary?.active ?? 0)}</span>
                            <span className="text-muted-foreground text-sm">{t('emp_status_caption').replace('{n}', fmtN(summary?.total ?? 0))}</span>
                        </div>
                        <div
                            role="img"
                            aria-label={t('emp_status_bar_sr')
                                .replace('{active}', fmtN(summary?.active ?? 0))
                                .replace('{resigned}', fmtN(summary?.resigned ?? 0))
                                .replace('{total}', fmtN(total))}
                            className="bg-secondary my-4 flex h-3 w-full overflow-hidden rounded-full"
                        >
                            <span className="block h-full bg-emerald-500" style={{ width: `${statusPct.active}%` }} />
                            <span className="bg-destructive block h-full" style={{ width: `${statusPct.resigned}%` }} />
                        </div>
                        <div className="flex gap-5">
                            <span className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                                <i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                {t('emp_status_active')} <b className="text-foreground font-semibold">{summary?.active ?? 0}</b>
                            </span>
                            <span className="text-muted-foreground flex items-center gap-2 text-[12.5px]">
                                <i className="bg-destructive h-2.5 w-2.5 rounded-full" />
                                {t('emp_status_resigned')} <b className="text-foreground font-semibold">{summary?.resigned ?? 0}</b>
                            </span>
                        </div>
                        <div className="border-border mt-4 flex items-center gap-3 border-t border-dashed pt-3.5">
                            <span className="text-destructive text-[32px] leading-none font-bold">{summary?.resigned_in_period ?? 0}</span>
                            <span className="text-muted-foreground text-[12.5px]">
                                {periodWord('emp_resigned_days', 'emp_resigned_all', 'emp_resigned_range')}
                            </span>
                        </div>
                    </div>
                </Card>

                {/* Recent resignations */}
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                        <UserMinus className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-semibold">{t('emp_recent_resignations')}</span>
                    </div>
                    <div className="max-h-[20rem] space-y-1 overflow-y-auto p-4">
                        {(summary?.recent_resignations ?? []).length === 0 ? (
                            <EmptyState title={t('emp_empty_overview_resignations')} hint={t('emp_empty_overview_resignations_hint')} />
                        ) : (
                            (summary?.recent_resignations ?? []).map((e) => (
                                <div key={e.id} className="border-border/60 flex items-center gap-3 border-b py-2 last:border-0">
                                    <UserAvatar name={e.name} photoUrl={e.photo_url} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{localName(e, lang)}</div>
                                        <div className="text-muted-foreground flex min-w-0 gap-x-3 text-xs">
                                            <span className="min-w-0 truncate">{e.position}</span>
                                            <span className="min-w-0 truncate">{localPair(e.department, e.department_th, lang)}</span>
                                        </div>
                                    </div>
                                    <span className="text-muted-foreground text-xs">{fmt.date(e.last_day)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-5 py-3.5')}>
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <Building2 className="text-muted-foreground h-4 w-4" />
                            {t('headcount_by_dept')}
                        </span>
                        {departments.length > DASH_DEPT_LIMIT && (
                            <button
                                type="button"
                                onClick={onViewDepartments}
                                className="text-brand-ink focus-visible:ring-ring rounded-sm text-xs font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                            >
                                {t('view_all')}
                            </button>
                        )}
                    </div>
                    <div className="divide-border/60 divide-y px-5">
                        {[...departments]
                            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
                            .slice(0, DASH_DEPT_LIMIT)
                            .map((d, i) => (
                                <div key={d.id} className="row-in flex items-center justify-between py-2.5" style={rowDelay(i)}>
                                    <div className="flex items-center gap-2.5">
                                        <span className="bg-muted rounded-md px-2 py-0.5 text-[11px]">{d.tag}</span>
                                        <span className="text-sm">{localName(d, lang)}</span>
                                    </div>
                                    <span className="text-sm font-semibold">{fmtN(d.count ?? 0)}</span>
                                </div>
                            ))}
                    </div>
                </Card>
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                        <UserPlus className="text-muted-foreground h-4 w-4" />
                        <span className="text-sm font-semibold">{t('recent_hires')}</span>
                    </div>
                    <div className="max-h-[22rem] space-y-1 overflow-y-auto p-4">
                        {(summary?.recent ?? []).length === 0 ? (
                            <EmptyState title={t('emp_empty_overview_hires')} hint={t('emp_empty_overview_hires_hint')} />
                        ) : (
                            (summary?.recent ?? []).map((e) => (
                                <div key={e.id} className="border-border/60 flex items-center gap-3 border-b py-2 last:border-0">
                                    <UserAvatar name={e.name} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{localName(e, lang)}</div>
                                        <div className="text-muted-foreground flex min-w-0 gap-x-3 text-xs">
                                            <span className="min-w-0 truncate">{e.position}</span>
                                            <span className="min-w-0 truncate">{localPair(e.department, e.department_th, lang)}</span>
                                        </div>
                                    </div>
                                    <span className="text-muted-foreground text-xs">{fmt.date(e.joined_at)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
