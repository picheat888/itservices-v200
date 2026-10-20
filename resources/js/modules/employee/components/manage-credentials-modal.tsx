import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { PasswordChecklist } from '@/shared/components/password-checklist';
import { PasswordInput } from '@/shared/components/password-input';
import { SectionLabel } from '@/shared/components/section-label';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { localName } from '@/shared/lib/local-name';
import { isValidPassword, randomPassword } from '@/shared/lib/password-policy';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { Check, CheckCircle2, Copy, EyeOff, KeyRound, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';
import { isValidUsername } from '../lib/credentials';

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
    const checklistId = useId();

    const canUsername = can('employees.set_credentials');
    const canReset = can('employees.reset_password');

    const [username, setUsername] = useState('');
    // The name currently on the account; the `employee` prop never refreshes after a save
    const [savedUsername, setSavedUsername] = useState('');
    const [usernameSaved, setUsernameSaved] = useState(false);
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [forceChange, setForceChange] = useState(true);
    const [newPassword, setNewPassword] = useState<string | null>(null);
    // Per-field messages sit under their own input; `formError` is the catch-all banner.
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);
    const [copied, setCopied] = useState(false);
    // Which action is in flight, so only the clicked button spins
    const [busy, setBusy] = useState<'username' | 'password' | null>(null);

    // Retain the last employee so content stays rendered during the close animation
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // Reset per employee opened (skip on close so content survives the exit animation).
    useEffect(() => {
        if (!employee) return;
        setUsername(employee.username ?? '');
        setSavedUsername(employee.username ?? '');
        setUsernameSaved(false);
        setPassword('');
        setShowPw(false);
        setForceChange(true);
        setNewPassword(null);
        setErrors({});
        setFormError('');
        setCopied(false);
        setBusy(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    const showFormError = (message: string) => {
        setFormError(message);
        setFormErrorCount((n) => n + 1);
    };

    const refusal = (data: { message?: string } | undefined) =>
        data?.message === 'super_account' ? t('cred_err_super_account') : (data?.message ?? t('cred_err_generic'));

    /** Renaming changes how this person signs in, so it is confirmed first. */
    const saveUsername = async () => {
        if (!employee || !username.trim() || busy !== null) return;
        const next = username.trim();
        setErrors({});
        setFormError('');
        setUsernameSaved(false);
        if (!isValidUsername(next)) {
            const invalid = { username: t('cred_err_username_format') };
            setErrors(invalid);
            focusFirstError(invalid);
            return;
        }
        if (next === savedUsername) return;

        await confirm({
            variant: 'warn',
            icon: KeyRound,
            title: t('emp_cred_username_confirm_title'),
            description: t('emp_cred_username_confirm_desc'),
            action: async () => {
                setBusy('username');
                try {
                    await updateCredentials.mutateAsync({ id: employee.id, payload: { username: next } });
                    setSavedUsername(next);
                    setUsernameSaved(true);
                } catch (e: unknown) {
                    const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
                    // A rejected name belongs under its field; anything else is form-level.
                    if (data?.errors?.username) {
                        setErrors({ username: t('cred_err_username_taken') });
                    } else {
                        showFormError(refusal(data));
                    }
                    throw e;
                } finally {
                    setBusy(null);
                }
            },
        });
    };

    /** A reset can't be undone, so it is confirmed first like renaming. */
    const resetPassword = async () => {
        if (!employee || busy !== null) return;
        setErrors({});
        setFormError('');
        if (!isValidPassword(password.trim())) {
            const invalid = { password: t('cred_err_password_policy') };
            setErrors(invalid);
            focusFirstError(invalid);
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
                        showFormError(refusal(data));
                    }
                    throw e;
                } finally {
                    setBusy(null);
                }
            },
        });
    };

    const copyPw = async () => {
        if (!newPassword) return;
        try {
            await navigator.clipboard.writeText(newPassword);
        } catch {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const empName = shown ? localName(shown, lang) : '';
    // Nothing to save until the field actually differs from the name on the account.
    const usernameDirty = username.trim() !== savedUsername;
    const isDirty = !newPassword && (usernameDirty || password !== '' || !forceChange);
    const guardClose = useDiscardGuard(!!employee && isDirty);

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-md gap-0 overflow-y-auto p-0">
                <FocusDialogHeader
                    icon={ShieldCheck}
                    eyebrow={t('emp_cred_manage_title')}
                    title={empName}
                    code={shown?.code}
                    srDescription={t('emp_cred_manage_title')}
                />

                {/* After a reset the only job left is handing over the new password */}
                {newPassword ? (
                    <div className="space-y-4 border-t px-6 py-5">
                        <div role="status" className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-[18px] w-[18px] shrink-0" aria-hidden />
                            <p className="text-sm font-semibold">{t('reset_password_success')}</p>
                        </div>

                        {/* Password + copy, with the "shown once" note as the card footer */}
                        <div className="border-border overflow-hidden rounded-lg border">
                            <div className="bg-muted/40 px-4 py-3">
                                <div className="text-muted-foreground mb-1 text-[10.5px] font-bold tracking-wider uppercase">
                                    {t('reset_password_new')}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 text-lg leading-snug font-semibold tracking-[0.12em] break-all">
                                        {newPassword}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => void copyPw()}
                                        title={copied ? t('cred_copied') : t('cred_copy')}
                                        aria-label={copied ? t('cred_copied') : t('cred_copy')}
                                        className={cn(
                                            'border-border hover:bg-accent focus-visible:ring-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-transparent transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                                            copied ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-start gap-2 border-t border-amber-300/70 bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-300">
                                <EyeOff className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
                                <span>{t('emp_cred_handover_note')}</span>
                            </div>
                        </div>

                        {/* Announces a successful copy */}
                        <span className="sr-only" aria-live="polite">
                            {copied ? t('cred_copied') : ''}
                        </span>
                    </div>
                ) : (
                    <div className="space-y-5 border-t px-6 py-5">
                        <FormErrorBanner message={formError} shakeKey={formErrorCount} />

                        {/* Username */}
                        {canUsername && (
                            <form
                                noValidate
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void saveUsername();
                                }}
                            >
                                <SectionLabel>{t('emp_cred_username_section')}</SectionLabel>
                                <Field label={t('cred_username')} name="username" error={errors.username}>
                                    {(control) => (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                {...control}
                                                value={username}
                                                // Lower-cased as typed, matching what the API stores
                                                onChange={(e) => {
                                                    setUsername(e.target.value.toLowerCase());
                                                    setErrors({});
                                                    setUsernameSaved(false);
                                                }}
                                                autoComplete="off"
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                                spellCheck={false}
                                            />
                                            <Button type="submit" disabled={busy !== null || !username.trim() || !usernameDirty}>
                                                {busy === 'username' ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : usernameSaved ? (
                                                    <Check className="h-4 w-4" />
                                                ) : null}
                                                {busy === 'username' ? t('saving') : usernameSaved ? t('saved') : t('save')}
                                            </Button>
                                        </div>
                                    )}
                                </Field>
                            </form>
                        )}

                        {/* Reset password */}
                        {canReset && (
                            <form
                                noValidate
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void resetPassword();
                                }}
                            >
                                <SectionLabel>{t('emp_cred_reset_section')}</SectionLabel>
                                <div className="space-y-4">
                                    <div>
                                        <Field
                                            label={t('reset_password_new')}
                                            name="password"
                                            error={errors.password}
                                            action={
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setPassword(randomPassword());
                                                        setShowPw(true);
                                                        setErrors({});
                                                    }}
                                                    className="text-muted-foreground hover:text-foreground -mr-2 h-7 gap-1.5 px-2 text-xs [&_svg]:size-3.5"
                                                >
                                                    <Wand2 />
                                                    {t('cred_auto')}
                                                </Button>
                                            }
                                        >
                                            {(control) => (
                                                <PasswordInput
                                                    {...control}
                                                    aria-describedby={[control['aria-describedby'], checklistId].filter(Boolean).join(' ')}
                                                    value={password}
                                                    visible={showPw}
                                                    onToggle={() => setShowPw((s) => !s)}
                                                    onChange={(v) => {
                                                        setPassword(v);
                                                        setErrors({});
                                                    }}
                                                />
                                            )}
                                        </Field>
                                        <PasswordChecklist id={checklistId} value={password} className="mt-2" />
                                    </div>
                                    <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                        <span className="text-sm">{t('emp_cred_force_change')}</span>
                                        <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                                    </div>
                                    {/* Nothing to reset to until a password is typed or generated. */}
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        variant="outline"
                                        disabled={busy !== null || !isValidPassword(password.trim())}
                                    >
                                        {busy === 'password' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                        {busy === 'password' ? t('saving') : t('emp_cred_reset_btn')}
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                )}

                <div className="border-border bg-muted/20 flex justify-end border-t px-6 py-3.5">
                    <Button variant={newPassword ? 'default' : 'outline'} onClick={() => guardClose(onClose)}>
                        {newPassword ? t('emp_cred_done') : t('close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
