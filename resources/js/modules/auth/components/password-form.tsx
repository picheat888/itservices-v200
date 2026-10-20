// The change / set password form shared by Change password, the expiry wall and Set your password,
// with the head they open with (icon, title, one line).
import { useT } from '@/lang';
import { authApi, type ChangePasswordPayload } from '@/modules/auth/api/authApi';
import { useAuth } from '@/modules/auth/hooks/use-auth';
import { loginErrorText } from '@/modules/auth/lib/login-error';
import { AlertIconCircle } from '@/shared/components/centered-alert';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { PasswordChecklist } from '@/shared/components/password-checklist';
import { PasswordInput } from '@/shared/components/password-input';
import { SaveButton } from '@/shared/components/save-button';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { isValidPassword } from '@/shared/lib/password-policy';
import { ME_KEY } from '@/shared/lib/query-client';
import { focusFirstError } from '@/shared/lib/utils';
import type { User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useToastStore } from '@/stores/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

export function PasswordDialogHead({ icon: Icon, warn, title, desc }: { icon: LucideIcon; warn?: boolean; title: string; desc: string }) {
    return (
        <>
            <AlertIconCircle icon={Icon} tone={warn ? 'warn' : 'brand'} className="mb-4" />
            <DialogTitle className="mb-1 text-center text-base leading-normal font-semibold tracking-normal">{title}</DialogTitle>
            <DialogDescription className="mb-5 text-center">{desc}</DialogDescription>
        </>
    );
}

type FieldKey = 'current' | 'next' | 'confirm';

export function PasswordForm({
    needsCurrent,
    submitLabel,
    secondaryLabel,
    onSecondary,
    onDone,
    onDirtyChange,
}: {
    /** False on a forced change: the API waives the current password while must_change_password is set. */
    needsCurrent: boolean;
    submitLabel: string;
    secondaryLabel: string;
    onSecondary: () => void;
    onDone?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const qc = useQueryClient();
    const { user } = useAuth();
    const pushToast = useToastStore((s) => s.push);
    const checklistId = useId();

    const [values, setValues] = useState<Record<FieldKey, string>>({ current: '', next: '', confirm: '' });
    const [shown, setShown] = useState<Record<FieldKey, boolean>>({ current: false, next: false, confirm: false });
    const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);

    const dirty = values.current !== '' || values.next !== '' || values.confirm !== '';
    useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

    const change = useMutation({
        mutationFn: (payload: ChangePasswordPayload) => authApi.changePassword(payload),
        // The flag that raised a wall turns false here, which unmounts it
        onSuccess: (fresh) => {
            qc.setQueryData<User | null>(ME_KEY, fresh);
            pushToast(t('pwd_saved_toast'), 'success');
        },
    });

    const edit = (key: FieldKey) => (value: string) => {
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
    };

    const showErrors = (found: Partial<Record<FieldKey, string>>) => {
        setErrors(found);
        focusFirstError(found as Record<string, string>);
    };

    const submit = () => {
        if (change.isPending) return;
        setFormError('');
        // Mirrors the API rules; the server stays the authority
        const found: Partial<Record<FieldKey, string>> = {};
        if (needsCurrent && !values.current) found.current = t('pwd_err_current_required');
        if (!isValidPassword(values.next)) found.next = t('cred_err_password_policy');
        if (!values.confirm) found.confirm = t('pwd_err_confirm_required');
        else if (values.next !== values.confirm) found.confirm = t('pwd_mismatch');
        if (Object.keys(found).length) {
            showErrors(found);
            return;
        }

        const payload: ChangePasswordPayload = { password: values.next, password_confirmation: values.confirm };
        if (needsCurrent) payload.current_password = values.current;
        // Per-call callbacks are skipped once the dialog has unmounted, so a Cancel mid-request cannot close twice
        change.mutate(payload, {
            onSuccess: () => onDone?.(),
            onError: (e: unknown) => {
                const response = (e as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } } })?.response;
                const data = response?.data;
                const server: Partial<Record<FieldKey, string>> = {};
                if (data?.errors?.current_password?.[0]) server.current = data.errors.current_password[0];
                if (data?.errors?.password?.[0]) server.next = data.errors.password[0];
                if (Object.keys(server).length) {
                    showErrors(server);
                } else {
                    // Locked after too many wrong passwords: the sign-in wording with the wait, in place of the last field error
                    if (response?.status === 429) setErrors({});
                    setFormError(response?.status === 429 ? loginErrorText(e, t, fmtN) : (data?.message ?? t('pwd_change_failed')));
                    setFormErrorCount((n) => n + 1);
                }
            },
        });
    };

    const input = (key: FieldKey, label: string) => (
        <Field label={label} required name={key} error={errors[key]}>
            {(control) => (
                <PasswordInput
                    {...control}
                    aria-describedby={
                        key === 'next' ? [control['aria-describedby'], checklistId].filter(Boolean).join(' ') : control['aria-describedby']
                    }
                    autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                    placeholder=""
                    value={values[key]}
                    visible={shown[key]}
                    onToggle={() => setShown((s) => ({ ...s, [key]: !s[key] }))}
                    onChange={edit(key)}
                />
            )}
        </Field>
    );

    return (
        <form
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            {/* Lets password managers save the new password against this account */}
            <input type="text" name="username" autoComplete="username" value={user?.username || user?.email || ''} readOnly hidden />
            <div className="space-y-3">
                <FormErrorBanner message={formError} shakeKey={formErrorCount} />
                {needsCurrent && input('current', t('pwd_current'))}
                <div>
                    {input('next', t('pwd_new'))}
                    <PasswordChecklist id={checklistId} value={values.next} className="mt-2" />
                </div>
                {input('confirm', t('pwd_confirm'))}
            </div>

            <div className="mt-5 flex flex-col gap-2">
                <SaveButton type="submit" className="w-full" loading={change.isPending}>
                    {submitLabel}
                </SaveButton>
                <Button type="button" variant="ghost" className="text-muted-foreground w-full" onClick={onSecondary}>
                    {secondaryLabel}
                </Button>
            </div>
        </form>
    );
}
