import { useT } from '@/lang';
import { useSettings } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { PasswordChecklist } from '@/shared/components/password-checklist';
import { PasswordInput } from '@/shared/components/password-input';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { localName } from '@/shared/lib/local-name';
import { isValidPassword, randomPassword } from '@/shared/lib/password-policy';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';
import { isValidUsername } from '../lib/credentials';

/** Create a login (username + password) for an employee who has none yet; needs employees.set_credentials. */
export function SetCredentialsModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { setCredentials } = useEmployeeMutations();
    const { data: settings } = useSettings();
    // Null = no default Role Group and no seeded Staff role
    const noDefaultRole = !!settings && settings.default_employee_role_label === null;
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    // Per-field messages; `formError` is the banner for failures that belong to no field
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);
    // Each field reveals on its own
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    // Force the employee to set their own password at the first sign-in (default on).
    const [forceChange, setForceChange] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    // Brief success state — shows "✓ Saved" before the dialog closes.
    const [saved, setSaved] = useState(false);
    // The saved pair, revealed once in the stacked dialog
    const [savedCreds, setSavedCreds] = useState<{ username: string; password: string } | null>(null);
    const checklistId = useId();

    // Retain the last employee so content stays rendered during the close animation
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // Same retention for the stacked reveal dialog
    const [shownCreds, setShownCreds] = useState(savedCreds);
    useEffect(() => {
        if (savedCreds) setShownCreds(savedCreds);
    }, [savedCreds]);

    // Reset per employee opened; skipped on close so "✓ Saved" survives the exit animation
    useEffect(() => {
        if (!employee) return;
        setUsername('');
        setPassword('');
        setConfirm('');
        setErrors({});
        setFormError('');
        setShowPw(false);
        setShowConfirm(false);
        setForceChange(true);
        setSavedCreds(null);
        setSaved(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    const isDirty = username !== '' || password !== '' || confirm !== '' || !forceChange;
    const guardClose = useDiscardGuard(!!employee && isDirty && !saved);

    const showFormError = (message: string) => {
        setFormError(message);
        setFormErrorCount((n) => n + 1);
    };

    // Auto-fill: first name + "_" + 2 letters of the last name, plus a random password
    const handleAuto = () => {
        if (!employee) return;
        const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const first = clean(employee.first_name ?? '');
        const last = clean(employee.last_name ?? '').slice(0, 2);
        // Thai-only names clean to nothing, so fall back to the employee code
        const fromName = first && last ? `${first}_${last}` : first;
        const u = isValidUsername(fromName) ? fromName : clean(employee.code ?? '');
        const p = randomPassword();
        setUsername(u);
        setPassword(p);
        setConfirm(p);
        setShowPw(true);
        setShowConfirm(true);
        setErrors({});
        setFormError('');
    };

    /** Drop a field's error as soon as it's edited — typing counts as fixing it. */
    const clearError = (key: string) =>
        setErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });

    /** UX-side checks mirroring the server rules (Laravel stays the authority). */
    const validate = () => {
        const e: Record<string, string> = {};
        if (!username.trim()) e.username = t('cred_err_username_required');
        else if (!isValidUsername(username.trim())) e.username = t('cred_err_username_format');
        if (!isValidPassword(password)) e.password = t('cred_err_password_policy');
        if (!confirm || password !== confirm) e.confirm = t('cred_err_no_match');
        setErrors(e);
        if (Object.keys(e).length) focusFirstError(e);
        return Object.keys(e).length === 0;
    };

    const copy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            return;
        }
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    const handleSubmit = async () => {
        if (!employee || setCredentials.isPending || saved) return;
        setFormError('');
        if (!validate()) return;
        try {
            await setCredentials.mutateAsync({
                id: employee.id,
                username: username.trim(),
                password,
                password_confirmation: confirm,
                force_change: forceChange,
            });
            setSaved(true);
            setSavedCreds({ username: username.trim(), password });
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            // A rejected username belongs under that field; anything else is a form-level failure.
            if (data?.errors?.username) {
                const taken = { username: t('cred_err_username_taken') };
                setErrors(taken);
                focusFirstError(taken);
            } else if (data?.errors?.role?.[0] === 'no_role_configured') {
                // A code, not a sentence (see EmployeeService::NO_ROLE_CONFIGURED)
                showFormError(t('cred_err_no_role'));
            } else if (data?.message === 'super_account') {
                showFormError(t('cred_err_super_account'));
            } else {
                showFormError(data?.message ?? t('cred_err_generic'));
            }
        }
    };

    /** Close the post-save reveal — the account is created, so the whole flow ends here. */
    const closeReveal = () => {
        setSavedCreds(null);
        onClose();
    };

    const empName = shown ? localName(shown, lang) : '';

    return (
        <>
            <Dialog open={!!employee} onOpenChange={(o) => !o && guardClose(onClose)}>
                <FormDialogContent>
                    <FocusDialogHeader
                        icon={ShieldCheck}
                        eyebrow={t('cred_set_title')}
                        title={empName}
                        code={shown?.code ?? undefined}
                        srDescription={t('cred_set_title')}
                    />

                    <form
                        noValidate
                        className="contents"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <DialogBody>
                            <FormErrorBanner message={formError} shakeKey={formErrorCount} />

                            {/* Install has no default role: no account can be created */}
                            {noDefaultRole && (
                                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <div className="text-muted-foreground text-xs">{t('cred_err_no_role')}</div>
                                </div>
                            )}

                            <Field
                                label={t('cred_username')}
                                required
                                name="username"
                                error={errors.username}
                                help={t('cred_username_hint')}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleAuto}
                                        className="text-muted-foreground hover:text-foreground -mr-2 h-7 gap-1.5 px-2 text-xs [&_svg]:size-3.5"
                                    >
                                        <Wand2 />
                                        {t('cred_auto')}
                                    </Button>
                                }
                            >
                                <Input
                                    value={username}
                                    // Lower-cased as typed, matching what the API stores
                                    onChange={(e) => {
                                        setUsername(e.target.value.toLowerCase());
                                        clearError('username');
                                    }}
                                    placeholder={t('cred_username_ph')}
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                            </Field>
                            <div>
                                <Field label={t('cred_password')} required name="password" error={errors.password}>
                                    {(control) => (
                                        <PasswordInput
                                            {...control}
                                            aria-describedby={[control['aria-describedby'], checklistId].filter(Boolean).join(' ')}
                                            value={password}
                                            visible={showPw}
                                            onToggle={() => setShowPw((s) => !s)}
                                            onChange={(v) => {
                                                setPassword(v);
                                                clearError('password');
                                            }}
                                        />
                                    )}
                                </Field>
                                <PasswordChecklist id={checklistId} value={password} className="mt-2" />
                            </div>
                            <Field label={t('cred_confirm_password')} required name="confirm" error={errors.confirm}>
                                {(control) => (
                                    <PasswordInput
                                        {...control}
                                        value={confirm}
                                        visible={showConfirm}
                                        onToggle={() => setShowConfirm((s) => !s)}
                                        onChange={(v) => {
                                            setConfirm(v);
                                            clearError('confirm');
                                        }}
                                    />
                                )}
                            </Field>

                            <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                                <span className="text-sm">{t('emp_cred_force_change')}</span>
                                <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                            </div>
                        </DialogBody>

                        <DialogFooterBar>
                            <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                                {t('cancel')}
                            </Button>
                            <Button type="submit" disabled={setCredentials.isPending || saved}>
                                {setCredentials.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : saved ? (
                                    <Check className="h-4 w-4" />
                                ) : null}
                                {setCredentials.isPending ? t('saving') : saved ? t('saved') : t('save')}
                            </Button>
                        </DialogFooterBar>
                    </form>
                </FormDialogContent>
            </Dialog>

            {/* Stacked reveal after a successful save; closing it ends the whole flow */}
            <Dialog open={!!savedCreds} onOpenChange={(o) => !o && closeReveal()}>
                <FormDialogContent>
                    <FocusDialogHeader
                        icon={ShieldCheck}
                        eyebrow={t('cred_set_title')}
                        title={empName}
                        code={shown?.code ?? undefined}
                        srDescription={t('cred_saved_title')}
                    />

                    <DialogBody className="space-y-4">
                        <div role="status" className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-[18px] w-[18px] shrink-0" aria-hidden />
                            <p className="text-sm font-semibold">{t('cred_saved_title')}</p>
                        </div>

                        <div className="space-y-2">
                            {[
                                { key: 'u', label: t('cred_username'), value: shownCreds?.username ?? '' },
                                { key: 'p', label: t('cred_password'), value: shownCreds?.password ?? '' },
                            ].map((row) => (
                                <div key={row.key} className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-muted-foreground text-[10.5px] font-semibold tracking-wide uppercase">{row.label}</div>
                                        <div className="truncate text-sm font-semibold">{row.value}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void copy(row.value, row.key)}
                                        title={copied === row.key ? t('cred_copied') : t('cred_copy')}
                                        aria-label={copied === row.key ? t('cred_copied') : `${t('cred_copy')} ${row.label}`}
                                        className={cn(
                                            'hover:bg-accent focus-visible:ring-ring grid h-8 w-8 shrink-0 place-items-center rounded-md transition focus-visible:ring-2 focus-visible:outline-hidden',
                                            copied === row.key ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                        )}
                                    >
                                        {copied === row.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <p className="text-muted-foreground text-xs">{t('cred_share_hint')}</p>

                        {/* Announces a successful copy */}
                        <span className="sr-only" aria-live="polite">
                            {copied ? t('cred_copied') : ''}
                        </span>
                    </DialogBody>

                    <DialogFooterBar>
                        <Button
                            variant="outline"
                            onClick={() => void copy(`Username: ${shownCreds?.username ?? ''}\nPassword: ${shownCreds?.password ?? ''}`, 'all')}
                        >
                            {copied === 'all' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied === 'all' ? t('cred_copied') : t('cred_copy')}
                        </Button>
                        <Button onClick={closeReveal}>{t('emp_cred_done')}</Button>
                    </DialogFooterBar>
                </FormDialogContent>
            </Dialog>
        </>
    );
}
