// The empty state of a dialog tab: the shared EmptyState sized for a tab body.
import { EmptyState, type EmptyKind } from './empty-state';

export function EmptyPane({ kind, title, hint }: { kind?: EmptyKind; title: string; hint?: string | null }) {
    return <EmptyState kind={kind} title={title} hint={hint} className="min-h-[220px]" />;
}
