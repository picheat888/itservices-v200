/** One headline number on a report page: label, value, optional unit, and a footer line. */
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';

export function KpiTile({
    label,
    badge,
    value,
    unit,
    footer,
    alert,
}: {
    label: string;
    badge?: React.ReactNode;
    value: string;
    unit?: string;
    footer?: React.ReactNode;
    alert?: boolean;
}) {
    return (
        <Card className={cn('flex min-w-0 flex-col gap-1.5 p-4', alert && 'border-amber-500/50')}>
            <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{label}</span>
                {badge}
            </div>
            <div className="font-mono text-2xl font-bold">
                {value}
                {unit && <span className="text-muted-foreground ml-1 text-sm font-medium">{unit}</span>}
            </div>
            {footer && <div className="text-muted-foreground text-xs">{footer}</div>}
        </Card>
    );
}
