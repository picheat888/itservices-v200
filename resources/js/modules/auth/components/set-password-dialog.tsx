import { useT } from '@/lang';
import { authApi, type ChangePasswordPayload } from '@/modules/auth/api/authApi';
import { useLogout } from '@/modules/auth/hooks/use-auth';
import { Field } from '@/shared/components/field';
import { PasswordChecklist } from '@/shared/components/password-checklist';
import { isValidPassword } from '@/shared/lib/password-policy';
import { ME_KEY } from '@/shared/lib/query-client';
import type { User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';

/**
 * Blocking overlay for the account whose password was set by someone else — a freshly
 * provisioned account or an admin reset (`user.must_change_password`). Kept separate from
 * the expiry overlay because nothing has gone wrong here: this is usually the person's first
 * sign-in, and they are holding a temporary password they were handed.
 */
export function SetPasswordDialog() {
    const t = useT();
    const qc = useQueryClient();
    const logout = useLogout();

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);

    const change = useMutation({
        mutationFn: (payload: ChangePasswordPayload) => authApi.changePassword(payload),
        onSuccess: (user) => {
            // Refreshes auth state — the flag is cleared, which unmounts this overlay.
            qc.setQueryData<User | null>(ME_KEY, user);
        },
        onError: (e: unknown) => {
            const res = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
            const firstError = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined;
            setError(firstError ?? res?.data?.message ?? t('pwd_change_failed'));
        },
    });

    const submit = () => {
        setError(null);
        if (!isValidPassword(next)) {
            setError(t('cred_err_password_policy'));
            return;
        }
        if (next !== confirm) {
            setError(t('pwd_mismatch'));
            return;
        }
        change.mutate({ current_password: current, password: next, password_confirmation: confirm });
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgb(15_23_42_/_0.5)] backdrop-blur-[2px]">
            <div className="bg-background border-border mx-4 w-full max-w-sm overflow-hidden rounded-[14px] border shadow-2xl">
                <div className="p-6">
                    <div className="mb-4 flex justify-center">
                        {/* Brand tint, not a warning colour — this is a setup step, not a fault. */}
                        <div className="bg-brand/10 flex h-12 w-12 items-center justify-center rounded-full">
                            <KeyRound className="text-brand h-6 w-6" />
                        </div>
                    </div>

                    <h2 className="mb-1 text-center text-base font-semibold">{t('pwd_set_title')}</h2>
                    <p className="text-muted-foreground mb-5 text-center text-sm">{t('pwd_set_desc')}</p>

                    <div className="space-y-3">
                        {/* Named for what they were handed, not "current password". */}
                        <Field label={t('pwd_set_temp')}>
                            <Input
                                type="password"
                                value={current}
                                onChange={(e) => setCurrent(e.target.value)}
                                autoComplete="current-password"
                                autoFocus
                            />
                        </Field>
                        <Field label={t('pwd_new')}>
                            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
                            <PasswordChecklist value={next} className="mt-2" />
                        </Field>
                        <Field label={t('pwd_confirm')} error={error ?? undefined}>
                            <Input
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                autoComplete="new-password"
                                onKeyDown={(e) => e.key === 'Enter' && submit()}
                            />
                        </Field>
                    </div>

                    <div className="mt-5 flex flex-col gap-2">
                        <Button className="w-full" onClick={submit} disabled={change.isPending || !current || !next || !confirm}>
                            {t('pwd_set_submit')}
                        </Button>
                        <Button variant="ghost" className="text-muted-foreground w-full" onClick={() => logout.mutate()}>
                            {t('profile_signout')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
