// The empty state of a dialog tab: an icon tile over one line of text.
import type { LucideIcon } from 'lucide-react';

export function EmptyPane({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
    return (
        <div className="text-muted-foreground flex min-h-[220px] flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="bg-muted text-muted-foreground grid h-14 w-14 place-items-center rounded-2xl">
                <Icon className="h-6 w-6" aria-hidden />
            </div>
            <div className="text-sm">{text}</div>
        </div>
    );
}
