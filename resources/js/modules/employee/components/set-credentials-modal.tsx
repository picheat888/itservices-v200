import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { cn } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, Eye, EyeOff, Loader2, ShieldCheck, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-employees';

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
    const [error, setError] = useState('');
    const [showPw, setShowPw] = useState(false);
    // Force the employee to set their own password at the first sign-in (default on).
    const [forceChange, setForceChange] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    // Brief success state — shows "✓ Saved" before the dialog closes.
    const [saved, setSaved] = useState(false);
    // Holds the auto-generated pair so the stacked confirm dialog can show them in plain text.
    const [autoCreds, setAutoCreds] = useState<{ username: string; password: string } | null>(null);

    // Retain the last employee so the content stays rendered while the dialog animates
    // closed — the prop goes null the moment it closes, which would blank the fade-out.
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // Reset the form whenever a different employee is opened. Skip on close (employee → null)
    // so the "✓ Saved" state isn't reverted to "Save" mid-way through the exit animation.
    useEffect(() => {
        if (!employee) return;
        setUsername('');
        setPassword('');
        setConfirm('');
        setError('');
        setShowPw(false);
        setForceChange(true);
        setAutoCreds(null);
        setSaved(false);
        // Re-run only when a different employee opens (id), not on every employee object change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee?.id]);

    // Auto-fill: username = first name + "_" + first 2 letters of last name (lowercased);
    // password = the employee code. Then reveal the pair in a confirm dialog.
    const handleAuto = () => {
        if (!employee) return;
        const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const u = `${clean(employee.first_name ?? '')}_${clean(employee.last_name ?? '').slice(0, 2)}`;
        const p = employee.code ?? '';
        setUsername(u);
        setPassword(p);
        setConfirm(p);
        setShowPw(true);
        setError('');
        setAutoCreds({ username: u, password: p });
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
        setError('');
        if (!username.trim()) {
            setError(t('cred_err_username_required'));
            return;
        }
        if (password.length < 6) {
            setError(t('cred_err_password_short'));
            return;
        }
        if (password !== confirm) {
            setError(t('cred_err_no_match'));
            return;
        }
        try {
            await setCredentials.mutateAsync({
                id: employee.id,
                username: username.trim(),
                password,
                password_confirmation: confirm,
                force_change: forceChange,
            });
            // Flash "✓ Saved" briefly, then close.
            setSaved(true);
            window.setTimeout(onClose, 1200);
        } catch (e: unknown) {
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            // Surface the unique-username rejection clearly (localized), else the server message.
            setError(data?.errors?.username ? t('cred_err_username_taken') : (data?.message ?? t('cred_err_generic')));
        }
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
                        {/* Auto-generate */}
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground text-xs">{t('cred_auto_hint')}</span>
                            <Button type="button" variant="outline" size="sm" onClick={handleAuto}>
                                <Wand2 className="h-4 w-4" />
                                {t('cred_auto')}
                            </Button>
                        </div>

                        <Field label={t('cred_username')}>
                            <Input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="font-mono"
                                placeholder="e.g. john_do"
                                autoComplete="off"
                            />
                        </Field>
                        <Field label={t('cred_password')}>
                            <div className="relative">
                                <Input
                                    type={showPw ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
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
                        <Field label={t('cred_confirm_password')}>
                            <Input
                                type={showPw ? 'text' : 'password'}
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="font-mono"
                                placeholder="••••••"
                                autoComplete="new-password"
                            />
                        </Field>

                        <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                            <span className="text-sm">{t('emp_cred_force_change')}</span>
                            <Switch checked={forceChange} onChange={setForceChange} aria-label={t('emp_cred_force_change')} />
                        </div>

                        {error && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{error}</div>}
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

            {/* Stacked confirm — reveals the generated pair in plain text, copyable. */}
            <Dialog open={!!autoCreds} onOpenChange={(o) => !o && setAutoCreds(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="text-brand h-5 w-5" />
                            {t('cred_auto_title')}
                        </DialogTitle>
                        <DialogDescription>{t('cred_share_hint')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        {[
                            { key: 'u', label: t('cred_username'), value: autoCreds?.username ?? '' },
                            { key: 'p', label: t('cred_password'), value: autoCreds?.password ?? '' },
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
                        <Button onClick={() => setAutoCreds(null)}>{t('cd_confirm')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
