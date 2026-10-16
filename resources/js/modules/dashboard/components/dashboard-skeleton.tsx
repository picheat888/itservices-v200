// Dashboard loading state: pulse blocks mirroring the heading, one tile row and one 3+2 card pair.
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { NARROW, PAIR_GRID, TILE_GRID, WIDE } from './dash-parts';

const Bar = ({ className }: { className: string }) => <div className={cn('bg-muted animate-pulse rounded', className)} />;

export function DashboardSkeleton() {
    return (
        <div className="space-y-8" aria-busy="true">
            {[0, 1].map((section) => (
                <div key={section} className="space-y-3">
                    <Bar className="h-5 w-40" />
                    <div className={TILE_GRID}>
                        {[0, 1, 2, 3, 4].map((tile) => (
                            <Card key={tile} className="space-y-3 p-4">
                                <Bar className="h-3.5 w-24" />
                                <Bar className="h-7 w-16" />
                                <Bar className="h-1.5 w-full" />
                                <Bar className="h-3 w-32" />
                            </Card>
                        ))}
                    </div>
                    <div className={PAIR_GRID}>
                        <Card className={cn(WIDE, 'h-64 gap-3 p-5')}>
                            <Bar className="h-4 w-36" />
                            <Bar className="w-full flex-1" />
                        </Card>
                        <Card className={cn(NARROW, 'h-64 gap-3 p-5')}>
                            <Bar className="h-4 w-28" />
                            <Bar className="w-full flex-1" />
                        </Card>
                    </div>
                </div>
            ))}
        </div>
    );
}
