// A decimal number of years ("4.3") that shows "4 ปี 4 เดือน" on hover, and says it to screen readers.
import { useT } from '@/lang';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';

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
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="cursor-help">
                        <span aria-hidden>{children}</span>
                        <span className="sr-only">{words}</span>
                    </span>
                </TooltipTrigger>
                <TooltipContent className="font-sans text-xs font-normal whitespace-nowrap">{words}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
