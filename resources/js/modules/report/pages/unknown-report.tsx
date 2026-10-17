/**
 * /reports/<anything not listed in ../routes.tsx> — a mistyped or retired report address. Says so
 * plainly and offers the way back to the Report Center, instead of an empty report shell.
 */
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Link } from 'react-router-dom';

export default function UnknownReportPage() {
    const t = useT();

    return (
        <Card className="border-dashed">
            <EmptyState kind="empty" title={t('rep_empty_unknown')} hint={t('rep_empty_unknown_hint')}>
                <Button asChild variant="outline">
                    <Link to="/reports">{t('rep_back_to_reports')}</Link>
                </Button>
            </EmptyState>
        </Card>
    );
}
