// Lot number as a link to its Lot page, and a one-line-per-lot list for the history tables.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

const lotPath = (lotNo: string) => `/stock/lots/${encodeURIComponent(lotNo)}`;

const LINK = 'text-brand-ink font-semibold hover:underline';

/** `newTab` for screens inside the app shell: the Lot page opens beside them, like "ประวัติทั้งหมด". */
export function LotLink({ lotNo, newTab = false, className }: { lotNo: string | null; newTab?: boolean; className?: string }) {
    const t = useT();
    if (!lotNo) {
        return <span>—</span>;
    }
    if (newTab) {
        return (
            <a
                href={lotPath(lotNo)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(LINK, 'inline-flex items-center gap-1', className)}
                translate="no"
            >
                {lotNo}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="sr-only">{t('stock_opens_new_tab')}</span>
            </a>
        );
    }
    return (
        <Link to={lotPath(lotNo)} className={cn(LINK, className)} translate="no">
            {lotNo}
        </Link>
    );
}

export function LotLines({ lots }: { lots: { lotNo: string | null; note: string }[] }) {
    if (lots.length === 0) {
        return <span>—</span>;
    }
    return (
        <div className="space-y-0.5">
            {lots.map((l, i) => (
                <div key={`${l.lotNo ?? ''}-${i}`} className="whitespace-nowrap">
                    <LotLink lotNo={l.lotNo} /> <span className="text-muted-foreground tabular-nums">{l.note}</span>
                </div>
            ))}
        </div>
    );
}
