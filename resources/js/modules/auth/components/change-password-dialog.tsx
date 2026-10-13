import { useT } from '@/lang';
import { useLogout } from '@/modules/auth/hooks/use-auth';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { BlockingDialog } from './blocking-dialog';
import { PasswordDialogHead, PasswordForm } from './password-form';

/** Change password: the expired-password wall (sign out only), or with `onClose` the form the user asked for. */
export function ChangePasswordDialog({ onClose }: { onClose?: () => void } = {}) {
    const t = useT();
    const logout = useLogout();

    // Only the voluntary form can be cancelled, so only it asks before dropping typed passwords
    const [dirty, setDirty] = useState(false);
    const guardClose = useDiscardGuard(!!onClose && dirty);
    // Radix close requests are ignored while the discard confirm is open
    const [asking, setAsking] = useState(false);
    const cancel = async (close: () => void) => {
        setAsking(true);
        await guardClose(close);
        setAsking(false);
    };

    if (!onClose) {
        return (
            <BlockingDialog>
                <div className="p-6">
                    <PasswordDialogHead icon={ShieldAlert} warn title={t('pwd_expired_title')} desc={t('pwd_expired_desc')} />
                    <PasswordForm
                        needsCurrent
                        submitLabel={t('pwd_change_submit')}
                        secondaryLabel={t('profile_signout')}
                        onSecondary={() => logout.mutate()}
                    />
                </div>
            </BlockingDialog>
        );
    }

    // Asked for: stacks over the My Profile dialog it may open from
    return (
        <Dialog open onOpenChange={(o) => !o && !asking && cancel(onClose)}>
            <DialogContent className="block max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-[14px] p-6 shadow-2xl [&>button]:hidden">
                <PasswordDialogHead icon={KeyRound} title={t('pwd_change_title')} desc={t('pwd_change_desc')} />
                <PasswordForm
                    needsCurrent
                    submitLabel={t('pwd_change_submit')}
                    secondaryLabel={t('cancel')}
                    onSecondary={() => cancel(onClose)}
                    onDone={onClose}
                    onDirtyChange={setDirty}
                />
            </DialogContent>
        </Dialog>
    );
}
