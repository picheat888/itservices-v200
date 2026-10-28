// Lot number as a link to its Lot page, and a one-line-per-lot list for the history tables.
import { Link } from 'react-router-dom';

export function LotLink({ lotNo }: { lotNo: string | null }) {
    if (!lotNo) {
        return <span>—</span>;
    }
    return (
        <Link to={`/stock/lots/${encodeURIComponent(lotNo)}`} className="text-brand-ink font-semibold hover:underline" translate="no">
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
                <div key={i} className="whitespace-nowrap">
                    <LotLink lotNo={l.lotNo} /> <span className="text-muted-foreground tabular-nums">{l.note}</span>
                </div>
            ))}
        </div>
    );
}
