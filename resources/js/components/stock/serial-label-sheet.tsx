import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import type { StockItem } from '@/types';
import { Printer, X } from 'lucide-react';

/** Pseudo-barcode: deterministic bar widths derived from the serial's characters. */
function Barcode({ value }: { value: string }) {
    const bars: number[] = [];
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        bars.push((c % 3) + 1); // bar width 1–3
        bars.push((c % 2) + 1); // gap width 1–2
    }
    bars.unshift(2, 1, 1);
    bars.push(1, 1, 2);
    return (
        <div className="flex h-7 items-stretch gap-px" aria-hidden="true">
            {bars.map((w, i) => (
                <span key={i} className={i % 2 === 0 ? 'bg-black' : 'bg-transparent'} style={{ width: w * 1.6 }} />
            ))}
        </div>
    );
}

/** Print scoping: hide the app, show only the label grid when printing. */
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #serial-print-area, #serial-print-area * { visibility: visible !important; }
  #serial-print-area { position: absolute; inset: 0; padding: 8mm; }
}`;

/**
 * SerialLabelSheet — full-screen, printable sticker sheet (50 × 25 mm cards),
 * one label per captured serial with a barcode for scanning back in.
 */
export function SerialLabelSheet({
    open,
    onClose,
    item,
    serials,
    warehouse,
    date,
}: {
    open: boolean;
    onClose: () => void;
    item: StockItem | null;
    serials: string[];
    warehouse?: string | null;
    date?: string;
}) {
    const t = useT();
    if (!open || !item) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/50">
            <style>{PRINT_CSS}</style>
            <div className="bg-background mx-auto mt-6 flex h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl shadow-xl">
                <div className="border-border flex items-center justify-between border-b p-4 print:hidden">
                    <div>
                        <div className="font-semibold">{t('stock_serial_labels')}</div>
                        <div className="text-muted-foreground text-xs">
                            {item.sku} · {serials.length} · 50 × 25 mm
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            <X className="h-4 w-4" />
                            {t('stock_close')}
                        </Button>
                        <Button onClick={() => window.print()}>
                            <Printer className="h-4 w-4" />
                            {t('stock_print')}
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-5">
                    <div id="serial-print-area" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {serials.map((s, i) => (
                            <div key={i} className="flex flex-col gap-1 rounded-md border border-black/20 bg-white p-2 text-black">
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="font-mono font-semibold">{item.sku}</span>
                                    <span className="truncate">{item.category ?? ''}</span>
                                </div>
                                <div className="truncate text-[11px] font-medium">
                                    {[item.brand, item.model].filter(Boolean).join(' ') || item.name}
                                </div>
                                <Barcode value={s} />
                                <div className="text-center font-mono text-[11px] font-bold">{s}</div>
                                <div className="flex items-center justify-between text-[9px] text-black/60">
                                    <span className="truncate">{warehouse ?? item.warehouse ?? ''}</span>
                                    <span className="font-mono">{(date ?? '').slice(0, 10)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
