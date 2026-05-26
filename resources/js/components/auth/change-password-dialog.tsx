import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLogout } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import { authApi, type ChangePasswordPayload } from '@/services/authApi';
import type { User } from '@/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';

const ME_KEY = ['auth', 'me'] as const;

/**
 * Blocking, non-dismissable overlay shown when the user's password has expired
 * (user.password_expired === true). The user must set a new password before they
 * can continue; the only escape hatch is signing out.
 */
export function ChangePasswordDialog() {
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
            // Refreshes auth state — password_expired is now false, unmounting this overlay.
            qc.setQueryData<User | null>(ME_KEY, user);
        },
        onError: (e: unknown) => {
            const res = (e as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
            const firstError = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined;
            setError(firstError ?? res?.data?.message ?? t('pwd_change_failed'));
        },
    });

    const submit = () => {
        setError(null);
        if (next.length < 8) {
            setError(t('pwd_too_short'));
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
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                            <ShieldAlert className="h-6 w-6 text-amber-500" />
                        </div>
                    </div>

                    <h2 className="mb-1 text-center text-base font-semibold">{t('pwd_expired_title')}</h2>
                    <p className="text-muted-foreground mb-5 text-center text-sm">{t('pwd_expired_desc')}</p>

                    <div className="space-y-3">
                        <Field label={t('pwd_current')}>
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
                            {t('pwd_change_submit')}
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
