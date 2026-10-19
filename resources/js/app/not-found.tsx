// Page for an address the app does not have, shown inside the shell so the menu still works.
import { useT } from '@/lang';
import { ErrorIcon, ErrorState } from '@/shared/components/error-state';
import { Button } from '@/shared/ui/button';
import { useUiStore } from '@/stores/ui';
import { SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
    const t = useT();
    const setPageMissing = useUiStore((s) => s.setPageMissing);

    // Tell the shell no menu entry or crumb owns this address
    useEffect(() => {
        setPageMissing(true);
        return () => setPageMissing(false);
    }, [setPageMissing]);

    return (
        <div className="grid min-h-[72dvh] place-items-center px-4">
            <ErrorState
                variant="page"
                visual={<ErrorIcon icon={SearchX} tone="info" />}
                title={t('cmn_not_found_title')}
                lines={[t('cmn_not_found_hint')]}
                actions={
                    <Button asChild className="w-full">
                        <Link to="/">{t('noaccess_back')}</Link>
                    </Button>
                }
            />
        </div>
    );
}
