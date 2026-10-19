// Page for an address the app does not have, shown inside the shell so the menu still works.
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/shared/ui/button';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
    const t = useT();

    return (
        <div className="grid min-h-[72dvh] place-items-center px-4">
            <EmptyState kind="search" titleAs="h1" title={t('cmn_not_found_title')} hint={t('cmn_not_found_hint')}>
                <Button asChild variant="outline">
                    <Link to="/">{t('noaccess_back')}</Link>
                </Button>
            </EmptyState>
        </div>
    );
}
