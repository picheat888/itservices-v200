/**
 * /reports/<anything not listed in ../routes.tsx> — a mistyped or retired report address. Says so
 * plainly and offers the way back to the Report Center, instead of an empty report shell.
 */
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UnknownReportPage() {
    const t = useT();

    return (
        <Card className="flex flex-col items-center gap-3 border-dashed p-10 text-center">
            <AlertCircle className="text-muted-foreground h-8 w-8" />
            <p className="text-muted-foreground text-sm">{t('rep_err_not_found')}</p>
            <Button asChild variant="outline">
                <Link to="/reports">{t('rep_back_to_reports')}</Link>
            </Button>
        </Card>
    );
}
