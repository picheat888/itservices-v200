import { useT } from '@/lang';
import { useLogout } from '@/modules/auth/hooks/use-auth';
import { BlockingDialog } from '@/shared/components/blocking-dialog';
import { KeyRound } from 'lucide-react';
import { PasswordDialogHead, PasswordForm } from './password-form';

/** Set your password: blocks an account whose password someone else set (new account or admin reset) until it has its own. */
export function SetPasswordDialog({ open = true }: { open?: boolean } = {}) {
    const t = useT();
    const logout = useLogout();

    return (
        <BlockingDialog open={open}>
            <div className="p-6">
                {/* Brand tint, not a warning: a setup step, not a fault */}
                <PasswordDialogHead icon={KeyRound} title={t('pwd_set_title')} desc={t('pwd_set_desc')} />
                <PasswordForm
                    needsCurrent={false}
                    submitLabel={t('pwd_set_submit')}
                    secondaryLabel={t('profile_signout')}
                    onSecondary={() => logout.mutate()}
                />
            </div>
        </BlockingDialog>
    );
}
