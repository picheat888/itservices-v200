// Re-mounts a report page when the date setting changes, so report helpers that read it outside a hook redraw too.
import { useUiStore } from '@/stores/ui';
import { Fragment, type ReactNode } from 'react';

export function ReportDateScope({ children }: { children: ReactNode }) {
    const { format, era, time } = useUiStore((s) => s.dateConfig);
    return <Fragment key={`${format}-${era}-${time}`}>{children}</Fragment>;
}
