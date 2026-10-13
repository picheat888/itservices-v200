// Width a date column needs for the widest date or time the current setting can print, measured in the cell's own font.
import { dateWidthSamples, type DateConfig } from '@/shared/lib/datetime';
import { useUiStore } from '@/stores/ui';
import { useLayoutEffect, useState } from 'react';

function measureWidest(config: DateConfig, lang: string, fontClass: string): string {
    const probe = document.createElement('span');
    probe.className = `${fontClass} invisible absolute whitespace-nowrap`;
    document.body.appendChild(probe);
    const { dates, times } = dateWidthSamples(config, lang);
    const widest = Math.max(
        ...[...dates, ...times].map((text) => {
            probe.textContent = text;
            return probe.getBoundingClientRect().width;
        }),
    );
    probe.remove();
    return `calc(${Math.ceil(widest)}px + 2 * var(--row-px))`;
}

export function useDateColumnWidth(fontClass = 'font-mono text-xs'): string {
    const config = useUiStore((s) => s.dateConfig);
    const lang = useUiStore((s) => s.lang);
    const [width, setWidth] = useState('9rem');

    // Measured before paint, then again once web fonts land (a fallback font measures differently).
    useLayoutEffect(() => {
        let live = true;
        const measure = () => live && setWidth(measureWidest(config, lang, fontClass));
        measure();
        document.fonts?.ready.then(measure);
        return () => {
            live = false;
        };
    }, [config, lang, fontClass]);

    return width;
}
