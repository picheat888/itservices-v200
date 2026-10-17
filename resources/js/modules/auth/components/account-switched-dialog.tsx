// "Account switched": the shared session now belongs to another account (a sign-in in another tab); Reload is the only way on.
import { useT } from '@/lang';
import type { User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { UserRoundCheck } from 'lucide-react';
import { BlockingDialog } from './blocking-dialog';

export function AccountSwitchedDialog({ user }: { user: User }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const name = lang === 'th' ? (user.name_th ?? user.name) : user.name;

    return (
        <BlockingDialog layer="top">
            <div className="p-6">
                <div className="bg-brand/15 text-brand-ink mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" aria-hidden>
                    <UserRoundCheck className="h-6 w-6" />
                </div>

                <DialogTitle className="mb-1 text-center text-base leading-normal font-semibold tracking-normal">
                    {t('session_switched_title')}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mb-5 text-center text-sm text-pretty">
                    {t('session_switched').replace('{name}', name)}
                </DialogDescription>

                <Button className="w-full" onClick={() => window.location.reload()}>
                    {t('session_reload')}
                </Button>
            </div>
        </BlockingDialog>
    );
}
