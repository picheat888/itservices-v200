/**
 * Names the current page in the topbar trail when it sits deeper than its menu entry —
 * "การจัดการระบบ / รายงาน / ภาพรวม Ticket & SLA". Set while the page is mounted and cleared
 * when it leaves, so the next page never inherits it. Used by the report pages.
 */
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';

export function useCrumbTail(label: string | null): void {
    const setCrumbTail = useUiStore((s) => s.setCrumbTail);

    useEffect(() => {
        setCrumbTail(label);
        return () => setCrumbTail(null);
    }, [label, setCrumbTail]);
}
