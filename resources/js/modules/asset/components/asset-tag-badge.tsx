import { cn } from '@/shared/lib/utils';
import { Tag } from 'lucide-react';

/**
 * The asset "Tag" (nickname) rendered as a small brand pill with a tag icon.
 * Shared across the asset tables + queues so the treatment stays consistent.
 */
export function AssetTagBadge({ tag, className }: { tag: string; className?: string }) {
    return (
        <span
            className={cn('bg-brand/10 text-brand inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className)}
        >
            <Tag className="h-3 w-3 shrink-0 opacity-70" />
            <span className="truncate">{tag}</span>
        </span>
    );
}
