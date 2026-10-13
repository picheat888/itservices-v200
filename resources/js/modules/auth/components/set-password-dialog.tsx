import { useT } from '@/lang';
import { useLogout } from '@/modules/auth/hooks/use-auth';
import { KeyRound } from 'lucide-react';
import { BlockingDialog } from './blocking-dialog';
import { PasswordDialogHead, PasswordForm } from './password-form';

/** Set your password: blocks an account whose password someone else set (new account or admin reset) until it has its own. */
export function SetPasswordDialog() {
    const t = useT();
    const logout = useLogout();

    return (
        <BlockingDialog>
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
