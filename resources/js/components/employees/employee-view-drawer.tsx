import { StatusBadge } from '@/components/shared/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Employee } from '@/types';
import { KeyRound, ShieldAlert, ShieldCheck, SquarePen, UserCheck, UserMinus } from 'lucide-react';

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
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

    const showCredentials = canSetCredentials && employee && !employee.has_account && employee.status !== 'resigned';

    return (
        <Sheet open={!!employee} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right" className="w-[440px] sm:max-w-[440px]">
                {employee && (
                    <>
                        <SheetHeader>
                            <SheetTitle>{lang === 'th' ? employee.name_th ?? employee.name : employee.name}</SheetTitle>
                        </SheetHeader>

                        <div className="mt-6 space-y-6">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    {employee.photo_url && <AvatarImage src={employee.photo_url} alt="" />}
                                    <AvatarFallback className="bg-brand/10 text-lg font-semibold text-brand">{initials(employee.name)}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <div className="text-sm text-muted-foreground">{employee.email || '—'}</div>
                                    <div className="mt-1">
                                        {employee.status === 'resigned' ? (
                                            <StatusBadge tone="red">{t('resigned')}</StatusBadge>
                                        ) : (
                                            <StatusBadge tone="green">{t('active')}</StatusBadge>
                                        )}
                                    </div>
                                    {employee.has_account ? (
                                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                            <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                                            {lang === 'th' ? 'มีบัญชีใช้งาน' : 'Has login account'}
                                        </div>
                                    ) : (
                                        <div className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                            <ShieldAlert className="h-3.5 w-3.5" />
                                            {lang === 'th' ? 'ยังไม่มีบัญชีใช้งาน' : 'No login account'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Row label={t('position')} value={employee.position} />
                                <Row label={t('department')} value={lang === 'th' ? employee.department_th ?? employee.department : employee.department} />
                                <Row label={t('emp_employee_id')} value={employee.code} mono />
                                <Row label={t('emp_phone')} value={employee.phone} mono />
                                <Row label={t('joined')} value={employee.joined_at} mono />
                                <Row label={t('emp_login_method')} value={employee.login_method === 'email' ? t('emp_login_email') : t('emp_login_userpass')} />
                            </div>

                            {showCredentials && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                            {t('cred_no_account')}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-xs text-muted-foreground">{t('cred_no_account_desc')}</p>
                                    <Button size="sm" className="mt-3 w-full" onClick={() => onSetCredentials(employee)}>
                                        <ShieldCheck className="h-4 w-4" />
                                        {t('emp_set_credentials')}
                                    </Button>
                                </div>
                            )}

                            <div>
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('assigned_assets')}</div>
                                <div className="rounded-lg bg-muted/50 py-6 text-center text-sm text-muted-foreground">{t('no_assigned_assets')}</div>
                            </div>

                            {/* Action buttons */}
                            <div className="space-y-2 border-t border-border pt-4">
                                <div className="flex gap-2">
                                    <Button variant="outline" className="flex-1" onClick={onClose}>
                                        {t('cancel')}
                                    </Button>
                                    {canEdit && employee.status !== 'resigned' && (
                                        <Button
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => onEdit(employee)}
                                            disabled={employee.is_super_admin && !isSuperViewer}
                                            title={employee.is_super_admin && !isSuperViewer ? t('emp_admin_protected') : undefined}
                                        >
                                            <SquarePen className="h-4 w-4" />
                                            {t('edit')}
                                        </Button>
                                    )}
                                </div>
                                {(canResetPassword || canResign || canCancelResign) && (
                                    <div className="flex gap-2">
                                        {canResetPassword && employee.has_account && (
                                            <Button
                                                variant="outline"
                                                className="flex-1"
                                                onClick={() => onResetPassword(employee)}
                                            >
                                                <KeyRound className="h-4 w-4" />
                                                {t('reset_password')}
                                            </Button>
                                        )}
                                        {canResign && employee.status !== 'resigned' && (
                                            <Button
                                                variant="destructive"
                                                className="flex-1"
                                                onClick={() => onResign(employee)}
                                            >
                                                <UserMinus className="h-4 w-4" />
                                                {t('resign_employee')}
                                            </Button>
                                        )}
                                        {canCancelResign && employee.status === 'resigned' && (
                                            <Button
                                                variant="outline"
                                                className="flex-1 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                                onClick={() => onCancelResign(employee)}
                                            >
                                                <UserCheck className="h-4 w-4" />
                                                {t('cancel_resign')}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
