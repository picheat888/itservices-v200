import { useT } from '@/lang';
import { authApi, type ChangePasswordPayload } from '@/modules/auth/api/authApi';
import { useLogout } from '@/modules/auth/hooks/use-auth';
import { Field } from '@/shared/components/field';
import { PasswordChecklist } from '@/shared/components/password-checklist';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { isValidPassword } from '@/shared/lib/password-policy';
import type { User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';

const ME_KEY = ['auth', 'me'] as const;

/** Change password: the expired-password wall (sign out only), or with `onClose` the form the user asked for. */
export function ChangePasswordDialog({ onClose }: { onClose?: () => void } = {}) {
    const t = useT();
    const qc = useQueryClient();
    const logout = useLogout();

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);

    const change = useMutation({
        mutationFn: (payload: ChangePasswordPayload) => authApi.changePassword(payload),
        // password_expired turns false, which unmounts the wall
        onSuccess: (user) => qc.setQueryData<User | null>(ME_KEY, user),
        onError: (e: unknown) => {
            const res = (e as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
            const firstError = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined;
            setError(firstError ?? res?.data?.message ?? t('pwd_change_failed'));
        },
    });

    // Only the voluntary form can be cancelled, so only it asks before dropping typed passwords
    const guardClose = useDiscardGuard(!!onClose && (current !== '' || next !== '' || confirm !== ''));
    // Radix close requests are ignored while the discard confirm is open
    const [asking, setAsking] = useState(false);
    const cancel = async (close: () => void) => {
        setAsking(true);
        await guardClose(close);
        setAsking(false);
    };

    const submit = () => {
        setError(null);
        // Mirrors the API rule; the checklist below spells out which part failed.
        if (!isValidPassword(next)) {
            setError(t('cred_err_password_policy'));
            return;
        }
        if (next !== confirm) {
            setError(t('pwd_mismatch'));
            return;
        }
        // Per-call onSuccess is skipped once the dialog has unmounted, so a Cancel mid-request cannot close twice
        change.mutate({ current_password: current, password: next, password_confirmation: confirm }, { onSuccess: () => onClose?.() });
    };

    const body = (
        <div className="p-6">
            <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                    <ShieldAlert className="h-6 w-6 text-amber-500 dark:text-amber-400" />
                </div>
            </div>

            {/* Title and line: why the app stopped (wall), or what the form is for */}
            <h2 className="mb-1 text-center text-base font-semibold">{onClose ? t('pwd_change_title') : t('pwd_expired_title')}</h2>
            <p className="text-muted-foreground mb-5 text-center text-sm">{onClose ? t('pwd_change_desc') : t('pwd_expired_desc')}</p>

            {/* A real <form>: password managers fill the pair and Enter submits */}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <div className="space-y-3">
                    <Field label={t('pwd_current')}>
                        <Input
                            type="password"
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            autoComplete="current-password"
                            autoFocus
                            placeholder={t('pwd_ph_current')}
                        />
                    </Field>
                    <Field label={t('pwd_new')}>
                        <Input
                            type="password"
                            value={next}
                            onChange={(e) => setNext(e.target.value)}
                            autoComplete="new-password"
                            placeholder={t('pwd_ph_new')}
                        />
                        <PasswordChecklist value={next} className="mt-2" />
                    </Field>
                    <Field label={t('pwd_confirm')} error={error ?? undefined}>
                        <Input
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            placeholder={t('pwd_ph_confirm')}
                        />
                    </Field>
                </div>

                <div className="mt-5 flex flex-col gap-2">
                    <Button type="submit" className="w-full" disabled={change.isPending || !current || !next || !confirm}>
                        {t('pwd_change_submit')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-muted-foreground w-full"
                        onClick={() => (onClose ? cancel(onClose) : logout.mutate())}
                    >
                        {onClose ? t('cancel') : t('profile_signout')}
                    </Button>
                </div>
            </form>
        </div>
    );

    // Asked for: a Radix dialog, so it stacks over the My Profile dialog it may open from.
    if (onClose) {
        return (
            <Dialog open onOpenChange={(o) => !o && !asking && cancel(onClose)}>
                <DialogContent
                    aria-describedby={undefined}
                    className="max-w-sm gap-0 overflow-hidden rounded-[14px] p-0 shadow-2xl [&>button]:hidden"
                >
                    <DialogTitle className="sr-only">{t('pwd_change_title')}</DialogTitle>
                    {body}
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgb(15_23_42_/_0.5)] backdrop-blur-[2px]">
            <div className="bg-background border-border mx-4 w-full max-w-sm overflow-hidden rounded-[14px] border shadow-2xl">{body}</div>
        </div>
    );
}
