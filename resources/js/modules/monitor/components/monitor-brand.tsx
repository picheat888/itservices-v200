// The app's logo and name from Settings for the monitor's headers; the line under the name defaults to the app's sub name.
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';

export function MonitorBrand({ sub, className }: { sub?: string; className?: string }) {
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);

    return (
        <div className={cn('flex min-w-0 items-center gap-4 text-left', className)}>
            {/* Uploaded logo, else the bundled default; frosted glass keeps a dark logo visible on the dark stage */}
            <img src={logoUrl || '/logo.svg'} alt="" className="logo-glass size-[56px] shrink-0 rounded-xl object-contain p-1" />
            <div className="min-w-0">
                <h1 className="truncate text-[30px] leading-[1.2] font-bold">{brandName}</h1>
                <span className="text-muted-foreground block truncate text-[20px]">{sub ?? brandSub}</span>
            </div>
        </div>
    );
}
