/**
 * Heading of a report page (the Ticket & SLA overview and every tabular report): title and
 * one-line description on the left, the page's actions (columns / schedule / export) on the
 * same row on the right. Names the report in the topbar trail (useCrumbTail), which is the
 * way back to the Report Center — so the page carries no back link of its own.
 */
import { useCrumbTail } from '@/shared/hooks/use-crumb-tail';

export function ReportHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
    useCrumbTail(title);

    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-muted-foreground max-w-[70ch] text-sm">{description}</p>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}
