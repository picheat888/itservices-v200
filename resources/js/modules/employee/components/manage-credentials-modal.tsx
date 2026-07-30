import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { Field } from '@/shared/components/field';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';
import { isValidPassword } from '../lib/password';
import { isValidUsername } from '../lib/username';
import { PasswordChecklist } from './password-checklist';

/**
 * "จัดการบัญชี" dialog for an employee who already has a login account.
 * Two independent sections, gated per permission:
 *  - Username (employees.set_credentials): edit + save the login name.
 *  - Reset password (employees.reset_password): optional custom password
 *    (blank = employee code) + a force-change-at-next-sign-in switch;
 *    reveals the new password with copy after a reset.
 */
export function ManageCredentialsModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { can } = useAuth();
    const { updateCredentials } = useEmployeeMutations();

    const canUsername = can('employees.set_credentials');
    const canReset = can('employees.reset_password');

    const [username, setUsername] = useState('');
    const [usernameSaved, setUsernameSaved] = useState(false);
    const [password, setPassword] = useState('');
    const [forceChange, setForceChange] = useState(true);
    const [newPassword, setNewPassword] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    // Retain the last employee so the content stays rendered while the dialog animates
    // closed — the prop goes null the moment it closes, which would blank the fade-out.
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // Reset per employee opened (skip on close so content survives the exit animation).
    useEffect(() => {
        if (!employee) return;
        setUsername(employee.username ?? '');
        setUsernameSaved(false);
        setPassword('');
        setForceChange(true);
        setNewPassword(null);
        setError('');
        setCopied(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    const saveUsername = async () => {
        if (!employee || !username.trim()) return;
        setError('');
        setUsernameSaved(false);
        if (!isValidUsername(username.trim())) {
            setError(t('cred_err_username_format'));
            return;
        }
        try {
            await updateCredentials.mutateAsync({ id: employee.id, payload: { username: username.trim() } });
            setUsernameSaved(true);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            setError(data?.errors?.username ? t('cred_err_username_taken') : (data?.message ?? t('cred_err_generic')));
        }
    };

    const resetPassword = async () => {
        if (!employee) return;
        setError('');
        // A blank field means "use the employee code"; anything typed must satisfy the policy.
        if (password.trim() && !isValidPassword(password.trim())) {
            setError(t('cred_err_password_policy'));
            return;
        }
        try {
            const res = await updateCredentials.mutateAsync({
                id: employee.id,
                payload: { reset_password: true, password: password.trim() || undefined, force_change: forceChange },
            });
            setNewPassword(res.new_password ?? null);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            setError(data?.errors?.password?.[0] ?? data?.message ?? t('cred_err_generic'));
        }
    };

    const copyPw = () => {
        if (!newPassword) return;
        try {
            navigator.clipboard?.writeText(newPassword);
        } catch {
            /* clipboard may be unavailable */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const empName = shown ? (lang === 'th' ? (shown.name_th ?? shown.name) : shown.name) : '';

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="text-brand h-5 w-5" />
                        {t('emp_cred_manage_title')}
                    </DialogTitle>
                    <DialogDescription>
                        {empName}
                        {shown?.code ? ` (${shown.code})` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* ── Username ── */}
                    {canUsername && (
                        <section className="space-y-2">
                            <div className="text-muted-foreground text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_cred_username_section')}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Lower-cased as it's typed, matching what the API stores. */}
                                <Input
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                                    className="font-mono"
                                    autoComplete="off"
                                />
                                <Button onClick={saveUsername} disabled={updateCredentials.isPending || !username.trim()}>
                                    {updateCredentials.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : usernameSaved ? (
                                        <Check className="h-4 w-4" />
                                    ) : null}
                                    {usernameSaved ? t('saved') : t('save')}
                                </Button>
                            </div>
                            {usernameSaved && <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('emp_cred_username_saved')}</p>}
                        </section>
                    )}

                    {canUsername && canReset && <div className="bg-border h-px" />}

                    {/* ── Reset password ── */}
                    {canReset && (
                        <section className="space-y-3">
                            <div className="text-muted-foreground text-[10.5px] font-bold tracking-wider uppercase">
                                {t('emp_cred_reset_section')}
                            </div>
                            {!newPassword ? (
                                <>
                                    <Field label={t('reset_password_new')}>
                                        <Input
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="font-mono"
                                            placeholder={shown?.code ?? ''}
                                            autoComplete="new-password"
                                        />
                                    </Field>
                                    {/* The hint covers the blank case; the checklist covers a typed one. */}
                                    <p className="text-muted-foreground text-xs">{t('emp_cred_reset_hint')}</p>
                                    <PasswordChecklist value={password} />
                                    <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                        <span className="text-sm">{t('emp_cred_force_change')}</span>
                                        <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                                    </div>
                                    <Button className="w-full" variant="outline" onClick={resetPassword} disabled={updateCredentials.isPending}>
                                        {updateCredentials.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <KeyRound className="h-4 w-4" />
                                        )}
                                        {t('emp_cred_reset_btn')}
                                    </Button>
                                </>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-muted-foreground text-sm">{t('reset_password_success')}</p>
                                    <div className="border-border bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2">
                                        <span className="flex-1 font-mono text-sm font-semibold tracking-wider">{newPassword}</span>
                                        <button
                                            type="button"
                                            onClick={copyPw}
                                            className="text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {copied ? (
                                                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                            ) : (
                                                <Copy className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {error && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{error}</div>}
                </div>

                <div className="flex justify-end">
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
