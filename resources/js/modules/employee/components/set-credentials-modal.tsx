import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, Eye, EyeOff, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';
import { isValidUsername } from '../lib/username';

// 0/O and 1/l/I are left out so a generated password survives being read aloud,
// written on a note, or retyped by the employee without confusion.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random temporary password drawn from an unambiguous alphabet (crypto-grade source). */
function randomPassword(length = 12): string {
    const picks = new Uint32Array(length);
    crypto.getRandomValues(picks);
    return Array.from(picks, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join('');
}

/**
 * Dialog for a permitted user (employees.set_credentials) to provision a
 * login account — username + password — for an employee who has none yet.
 */
export function SetCredentialsModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { setCredentials } = useEmployeeMutations();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    // Per-field messages (red border + helper text); `formError` is the catch-all banner
    // for failures that belong to no single field.
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');
    // Each field reveals on its own — one eye never unmasks the other field.
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    // Force the employee to set their own password at the first sign-in (default on).
    const [forceChange, setForceChange] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    // Brief success state — shows "✓ Saved" before the dialog closes.
    const [saved, setSaved] = useState(false);
    // The pair that was just SAVED — revealed once in the stacked dialog so the admin can
    // copy/share it; after this the password can no longer be retrieved.
    const [savedCreds, setSavedCreds] = useState<{ username: string; password: string } | null>(null);

    // Retain the last employee so the content stays rendered while the dialog animates
    // closed — the prop goes null the moment it closes, which would blank the fade-out.
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // Same retention for the stacked reveal dialog — closing sets savedCreds to null,
    // which would blank the username/password rows mid fade-out.
    const [shownCreds, setShownCreds] = useState(savedCreds);
    useEffect(() => {
        if (savedCreds) setShownCreds(savedCreds);
    }, [savedCreds]);

    // Reset the form whenever a different employee is opened. Skip on close (employee → null)
    // so the "✓ Saved" state isn't reverted to "Save" mid-way through the exit animation.
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
        // Re-run only when a different employee opens (id), not on every employee object change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    // Auto-fill: username = first name + "_" + first 2 letters of last name (lowercased);
    // password = a fresh random string — revealed in the form itself (showPw). The share/copy
    // reveal happens once after a successful save instead.
    const handleAuto = () => {
        if (!employee) return;
        const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const first = clean(employee.first_name ?? '');
        const last = clean(employee.last_name ?? '').slice(0, 2);
        // Thai-only names clean away to nothing, and a trailing "_" would break the username
        // rule — fall back to the employee code so the result is always usable.
        const fromName = first && last ? `${first}_${last}` : first;
        const u = isValidUsername(fromName) ? fromName : clean(employee.code ?? '');
        const p = randomPassword();
        setUsername(u);
        setPassword(p);
        setConfirm(p);
        // Both are revealed here so the generated pair can be checked before saving.
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

    /**
     * UX-side checks mirroring the server rules (Laravel stays the authority):
     * username required, password at least 6 characters, confirmation matching.
     */
    const validate = () => {
        const e: Record<string, string> = {};
        if (!username.trim()) e.username = t('cred_err_username_required');
        else if (!isValidUsername(username.trim())) e.username = t('cred_err_username_format');
        if (password.length < 8) e.password = t('cred_err_password_short');
        if (!confirm || password !== confirm) e.confirm = t('cred_err_no_match');
        setErrors(e);
        if (Object.keys(e).length) focusFirstError(e);
        return Object.keys(e).length === 0;
    };

    const copy = (text: string, key: string) => {
        try {
            navigator.clipboard?.writeText(text);
        } catch {
            /* clipboard may be unavailable */
        }
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    const handleSubmit = async () => {
        if (!employee) return;
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
            // Reveal the saved pair once (copy/share) — closing the reveal closes the whole flow.
            setSaved(true);
            setSavedCreds({ username: username.trim(), password });
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            // A rejected username belongs under that field; anything else is a form-level failure.
            if (data?.errors?.username) {
                const taken = { username: t('cred_err_username_taken') };
                setErrors(taken);
                focusFirstError(taken);
            } else {
                setFormError(data?.message ?? t('cred_err_generic'));
            }
        }
    };

    /** Close the post-save reveal — the account is created, so the whole flow ends here. */
    const closeReveal = () => {
        setSavedCreds(null);
        onClose();
    };

    const empName = shown ? (lang === 'th' ? (shown.name_th ?? shown.name) : shown.name) : '';

    return (
        <>
            <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="text-brand h-5 w-5" />
                            {t('cred_set_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {empName}
                            {shown?.code ? ` (${shown.code})` : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        {/* The shortcut rides the first field's label row: it fills this field and
                            the two below it, and the filled values speak for themselves. */}
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
                                onChange={(e) => {
                                    setUsername(e.target.value);
                                    clearError('username');
                                }}
                                className="font-mono"
                                placeholder="e.g. john_do"
                                autoComplete="off"
                            />
                        </Field>
                        <Field label={t('cred_password')} required name="password" error={errors.password} help={t('cred_password_hint')}>
                            <div className="relative">
                                <Input
                                    type={showPw ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        clearError('password');
                                    }}
                                    className="pr-9 font-mono"
                                    placeholder="••••••"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw((s) => !s)}
                                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                                    tabIndex={-1}
                                >
                                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </Field>
                        <Field label={t('cred_confirm_password')} required name="confirm" error={errors.confirm}>
                            <div className="relative">
                                <Input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={(e) => {
                                        setConfirm(e.target.value);
                                        clearError('confirm');
                                    }}
                                    className="pr-9 font-mono"
                                    placeholder="••••••"
                                    autoComplete="new-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm((s) => !s)}
                                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                                    tabIndex={-1}
                                >
                                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </Field>

                        <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                            <span className="text-sm">{t('emp_cred_force_change')}</span>
                            <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                        </div>

                        {formError && (
                            <div key={formError} className="bg-destructive/10 text-destructive animate-shake rounded-lg px-3 py-2 text-sm">
                                {formError}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleSubmit} disabled={setCredentials.isPending || saved}>
                            {setCredentials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                            {setCredentials.isPending ? t('saving') : saved ? t('saved') : t('save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Stacked reveal after a successful save — the one place the saved pair can be
                copied; closing it ends the whole flow. */}
            <Dialog open={!!savedCreds} onOpenChange={(o) => !o && closeReveal()}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="text-brand h-5 w-5" />
                            {t('cred_saved_title')}
                        </DialogTitle>
                        <DialogDescription>{t('cred_share_hint')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        {[
                            { key: 'u', label: t('cred_username'), value: shownCreds?.username ?? '' },
                            { key: 'p', label: t('cred_password'), value: shownCreds?.password ?? '' },
                        ].map((row) => (
                            <div key={row.key} className="border-border bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-muted-foreground text-[10.5px] font-semibold tracking-wide uppercase">{row.label}</div>
                                    <div className="truncate font-mono text-sm font-semibold">{row.value}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => copy(row.value, row.key)}
                                    title={copied === row.key ? t('cred_copied') : undefined}
                                    className={cn(
                                        'hover:bg-accent grid h-8 w-8 shrink-0 place-items-center rounded-md transition',
                                        copied === row.key ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                                    )}
                                >
                                    {copied === row.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </button>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button onClick={() => copy(`Username: ${shownCreds?.username ?? ''}\nPassword: ${shownCreds?.password ?? ''}`, 'all')}>
                            {copied === 'all' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {t('cred_copy')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
