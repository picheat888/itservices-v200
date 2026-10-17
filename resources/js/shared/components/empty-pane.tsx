// The empty state of a dialog tab: the shared EmptyState sized for a tab body.
import type { LucideIcon } from 'lucide-react';
import { EmptyState, type EmptyKind } from './empty-state';

// `icon` and `text` are the old props, kept until the callers move to kind/title/hint.
export function EmptyPane({ text, kind, title, hint }: { icon?: LucideIcon; text?: string; kind?: EmptyKind; title?: string; hint?: string | null }) {
    return <EmptyState kind={kind} title={title ?? text ?? ''} hint={hint} className="min-h-[220px]" />;
}
