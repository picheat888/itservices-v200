import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SectionLabel } from '@/shared/components/section-label';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, KeyRound, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';
import { isValidPassword, isValidUsername, randomPassword } from '../lib/credentials';
import { PasswordChecklist } from './password-checklist';

/**
 * "จัดการบัญชี" dialog for an employee who already has a login account.
 * Two independent sections, gated per permission:
 *  - Username (employees.set_credentials): edit + save the login name.
 *  - Reset password (employees.reset_password): a typed or generated password plus a
 *    force-change-at-next-sign-in switch; reveals the new password with copy afterwards.
 */
export function ManageCredentialsModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { can } = useAuth();
    const confirm = useConfirm();
    const { updateCredentials } = useEmployeeMutations();

    const canUsername = can('employees.set_credentials');
    const canReset = can('employees.reset_password');

    const [username, setUsername] = useState('');
    const [usernameSaved, setUsernameSaved] = useState(false);
    const [password, setPassword] = useState('');
    const [forceChange, setForceChange] = useState(true);
    const [newPassword, setNewPassword] = useState<string | null>(null);
    // Per-field messages sit under their own input; `formError` is the catch-all banner.
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    const [copied, setCopied] = useState(false);
    // Which action is in flight. Both buttons drive the same mutation, so its `isPending`
    // alone would spin them together — this keeps the spinner on the one that was clicked.
    const [busy, setBusy] = useState<'username' | 'password' | null>(null);

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
        setErrors({});
        setFormError('');
        setCopied(false);
        setBusy(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    /**
     * Renaming changes how this person signs in, so it goes through a confirm step first.
     * The confirm dialog owns the spinner while the request runs.
     */
    const saveUsername = async () => {
        if (!employee || !username.trim()) return;
        const next = username.trim();
        setErrors({});
        setFormError('');
        setUsernameSaved(false);
        if (!isValidUsername(next)) {
            setErrors({ username: t('cred_err_username_format') });
            return;
        }
        if (next === (employee.username ?? '')) return;

        await confirm({
            variant: 'warn',
            icon: KeyRound,
            title: t('emp_cred_username_confirm_title'),
            description: t('emp_cred_username_confirm_desc'),
            action: async () => {
                setBusy('username');
                try {
                    await updateCredentials.mutateAsync({ id: employee.id, payload: { username: next } });
                    setUsernameSaved(true);
                } catch (e: unknown) {
                    const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
                    // A rejected name belongs under its field; anything else is form-level.
                    if (data?.errors?.username) {
                        setErrors({ username: t('cred_err_username_taken') });
                    } else {
                        setFormError(data?.message ?? t('cred_err_generic'));
                    }
                    throw e;
                } finally {
                    setBusy(null);
                }
            },
        });
    };

    /**
     * A reset can't be undone — the old password stops working the moment it runs — so it
     * asks first, the same way renaming does.
     */
    const resetPassword = async () => {
        if (!employee) return;
        setErrors({});
        setFormError('');
        if (!isValidPassword(password.trim())) {
            setErrors({ password: t('cred_err_password_policy') });
            return;
        }

        await confirm({
            variant: 'warn',
            icon: KeyRound,
            title: t('emp_cred_reset_confirm_title'),
            description: t('emp_cred_reset_confirm_desc'),
            action: async () => {
                setBusy('password');
                try {
                    const res = await updateCredentials.mutateAsync({
                        id: employee.id,
                        payload: { reset_password: true, password: password.trim(), force_change: forceChange },
                    });
                    setNewPassword(res.new_password ?? null);
                } catch (e: unknown) {
                    const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
                    if (data?.errors?.password) {
                        setErrors({ password: data.errors.password[0] ?? t('cred_err_password_policy') });
                    } else {
                        setFormError(data?.message ?? t('cred_err_generic'));
                    }
                    throw e;
                } finally {
                    setBusy(null);
                }
            },
        });
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
    // Nothing to save until the field actually differs from the name on the account.
    const usernameDirty = username.trim() !== (shown?.username ?? '');

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
                <FocusDialogHeader
                    icon={ShieldCheck}
                    eyebrow={t('emp_cred_manage_title')}
                    title={empName}
                    code={shown?.code}
                    srDescription={t('emp_cred_manage_title')}
                />

                <div className="space-y-5 border-t px-6 py-5">
                    {/* ── Username ── */}
                    {canUsername && (
                        <section>
                            <SectionLabel>{t('emp_cred_username_section')}</SectionLabel>
                            <Field label={t('cred_username')} name="username" error={errors.username}>
                                <div className="flex items-center gap-2">
                                    {/* Lower-cased as it's typed, matching what the API stores. */}
                                    <Input
                                        value={username}
                                        onChange={(e) => {
                                            setUsername(e.target.value.toLowerCase());
                                            setErrors({});
                                        }}
                                        className="font-mono"
                                        autoComplete="off"
                                    />
                                    <Button onClick={saveUsername} disabled={busy !== null || !username.trim() || !usernameDirty}>
                                        {busy === 'username' ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : usernameSaved ? (
                                            <Check className="h-4 w-4" />
                                        ) : null}
                                        {usernameSaved ? t('saved') : t('save')}
                                    </Button>
                                </div>
                            </Field>
                            {usernameSaved && <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">{t('emp_cred_username_saved')}</p>}
                        </section>
                    )}

                    {/* ── Reset password ── */}
                    {canReset && (
                        <section>
                            <SectionLabel>{t('emp_cred_reset_section')}</SectionLabel>
                            {!newPassword ? (
                                <div className="space-y-4">
                                    <Field
                                        label={t('reset_password_new')}
                                        name="password"
                                        error={errors.password}
                                        action={
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setPassword(randomPassword())}
                                                className="text-muted-foreground hover:text-foreground -mr-2 h-7 gap-1.5 px-2 text-xs [&_svg]:size-3.5"
                                            >
                                                <Wand2 />
                                                {t('cred_auto')}
                                            </Button>
                                        }
                                    >
                                        <Input
                                            value={password}
                                            onChange={(e) => {
                                                setPassword(e.target.value);
                                                setErrors({});
                                            }}
                                            className="font-mono"
                                            // Eight dots — the same mask the creation dialog uses, and the
                                            // policy's minimum length at a glance.
                                            placeholder="••••••••"
                                            autoComplete="new-password"
                                        />
                                        {/* Sits with the field it describes, not as a separate block. */}
                                        <PasswordChecklist value={password} className="mt-2" />
                                    </Field>
                                    <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                        <span className="text-sm">{t('emp_cred_force_change')}</span>
                                        <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                                    </div>
                                    {/* Nothing to reset to until a password is typed or generated. */}
                                    <Button
                                        className="w-full"
                                        variant="outline"
                                        onClick={resetPassword}
                                        disabled={busy !== null || !isValidPassword(password.trim())}
                                    >
                                        {busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                        {t('emp_cred_reset_btn')}
                                    </Button>
                                </div>
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

                    {formError && (
                        <div key={formError} className="bg-destructive/10 text-destructive animate-shake rounded-lg px-3 py-2 text-sm">
                            {formError}
                        </div>
                    )}
                </div>

                <div className="border-border bg-muted/20 flex justify-end border-t px-6 py-3.5">
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
