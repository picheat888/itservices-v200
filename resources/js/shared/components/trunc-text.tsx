// One-line table text: ends in "…" when the column is too narrow, and the full text opens in the shared InfoPopover.
import { InfoPopover } from '@/shared/components/info-popover';
import { cn } from '@/shared/lib/utils';
import { useLayoutEffect, useRef, useState } from 'react';

export function TruncText({ text, className }: { text: string | null | undefined; className?: string }) {
    const inner = useRef<HTMLSpanElement>(null);
    const [cut, setCut] = useState(false);

    // Re-measure when the text or the column width changes
    useLayoutEffect(() => {
        const el = inner.current;
        if (!el) return;
        const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [text]);

    if (!text) return <span className="text-muted-foreground">—</span>;

    return (
        <InfoPopover as="span" inactive={!cut} label={text} content={text} isolate className="block min-w-0">
            <span ref={inner} className={cn('block truncate', className)}>
                {text}
            </span>
        </InfoPopover>
    );
}
