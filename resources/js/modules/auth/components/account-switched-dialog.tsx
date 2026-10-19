// "Account switched": the shared session now belongs to another account (a sign-in in another tab); Reload is the only way on.
import { useT } from '@/lang';
import { BlockingDialog } from '@/shared/components/blocking-dialog';
import { ErrorIcon, ErrorState } from '@/shared/components/error-state';
import { localName } from '@/shared/lib/local-name';
import type { User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useUiStore } from '@/stores/ui';
import { UserRoundCheck } from 'lucide-react';

export function AccountSwitchedDialog({ user }: { user: User }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const name = localName(user, lang);

    return (
        <BlockingDialog layer="top">
            <div className="p-6">
                <ErrorState
                    variant="dialog"
                    visual={<ErrorIcon icon={UserRoundCheck} tone="info" />}
                    title={t('session_switched_title')}
                    lines={t('session_switched').replace('{name}', name).split('\n')}
                    actions={
                        <Button className="w-full" onClick={() => window.location.reload()}>
                            {t('session_reload')}
                        </Button>
                    }
                />
            </div>
        </BlockingDialog>
    );
}
