// A decimal number of years ("4.3") that shows "4 ปี 4 เดือน" on hover, tap or keyboard, and says it to screen readers.
import { useT } from '@/lang';
import { InfoPopover } from '@/shared/components/info-popover';

export function useYearsInWords() {
    const t = useT();
    return (years: number) => {
        let whole = Math.floor(years);
        let months = Math.round((years - whole) * 12);
        if (months === 12) {
            whole += 1;
            months = 0;
        }
        if (whole === 0) return t('rep_age_m').replace('{m}', String(months));
        if (months === 0) return t('rep_age_y').replace('{y}', String(whole));
        return t('rep_age_ym').replace('{y}', String(whole)).replace('{m}', String(months));
    };
}

export function YearsTip({ years, children }: { years: number; children: React.ReactNode }) {
    const words = useYearsInWords()(years);
    return (
        <InfoPopover label={words} content={words} contentClassName="whitespace-nowrap">
            {children}
        </InfoPopover>
    );
}
