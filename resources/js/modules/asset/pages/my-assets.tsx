import { AssetStatusBadge, AssetTypeIcon } from '../components/asset-meta';
import { useAssetMutations, useMyAssets } from '../hooks/use-assets';
import { useAuth } from '@/modules/auth';
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { cn } from '@/shared/lib/utils';
import { Check, Inbox, Loader2, PackageCheck, Tag, Undo2 } from 'lucide-react';

/**
 * MyAssetsPage — employee self-service view of the assets assigned to the signed-in
 * user (matched by their employee code). Hand-overs pending the user's acceptance are
 * surfaced first with an "Accept" action; the rest are listed read-only. No assets.view
 * permission is required — this is the employee-facing counterpart to the IT Asset module.
 */
export default function MyAssetsPage() {
    const t = useT();
    const { user } = useAuth();
    const { data: assets = [], isLoading } = useMyAssets();
    const { accept, requestReturn } = useAssetMutations();
    const confirm = useConfirm();

    /** Ask before sending a held asset back to IT (goes to "pending return"). */
    const onReturn = (id: number, name: string, tag: string) =>
        confirm({
            variant: 'warn',
            title: t('asset_return'),
            description: t('my_assets_return_confirm'),
            entity: { name, sub: tag },
            confirmText: t('asset_return'),
            action: () => requestReturn.mutateAsync({ id }),
        });

    const linked = !!user?.employee_code;
    const pending = assets.filter((a) => a.status === 'pending_acceptance');
    const held = assets.filter((a) => a.status !== 'pending_acceptance');

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('my_assets')}</h1>
                <p className="text-muted-foreground text-sm">{t('my_assets_sub')}</p>
            </div>

            {!linked ? (
                <Card className="text-muted-foreground flex items-center gap-3 p-6 text-sm">
                    <Inbox className="h-5 w-5 shrink-0" />
                    {t('my_assets_no_link')}
                </Card>
            ) : isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : (
                <>
                    {/* Pending my acceptance — the actionable part. */}
                    {pending.length > 0 && (
                        <div>
                            <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                                <PackageCheck className="h-4 w-4" />
                                {t('my_assets_pending')}
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                                    {pending.length}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {pending.map((a) => (
                                    <Card key={a.id} className="flex items-start gap-3 border-emerald-500/40 bg-emerald-500/5 p-4">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                            <AssetTypeIcon type={a.type} className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-semibold">{a.model}</span>
                                                {/* "New" pill with a pulsing dot to signal a fresh hand-over. */}
                                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                                                    <span className="relative flex h-1.5 w-1.5">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                    </span>
                                                    {t('my_assets_new')}
                                                </span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                <span className="text-muted-foreground font-mono text-xs">{a.tag}</span>
                                                {a.nickname && (
                                                    <span className="bg-accent text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                                                        <Tag className="h-3 w-3 opacity-60" />
                                                        {a.nickname}
                                                    </span>
                                                )}
                                            </div>
                                            {a.last_reason && <div className="text-muted-foreground mt-1 truncate text-xs">{a.last_reason}</div>}
                                        </div>
                                        <Button
                                            size="sm"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            onClick={() => accept.mutate(a.id)}
                                            disabled={accept.isPending && accept.variables === a.id}
                                        >
                                            {accept.isPending && accept.variables === a.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Check className="h-4 w-4" />
                                            )}
                                            {t('asset_accept')}
                                        </Button>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Assets I currently hold. */}
                    <div>
                        <div className="text-muted-foreground mb-3 text-xs font-bold tracking-wide uppercase">{t('my_assets_held')}</div>
                        {held.length === 0 ? (
                            <Card className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
                                <Inbox className="text-muted-foreground/50 h-8 w-8" />
                                {t('my_assets_empty')}
                            </Card>
                        ) : (
                            <div className="border-border overflow-hidden rounded-xl border">
                                {held.map((a, i) => (
                                    <div
                                        key={a.id}
                                        className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-border/60 border-t')}
                                    >
                                        <div className="bg-accent text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                            <AssetTypeIcon type={a.type} className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">
                                                {a.model}
                                                {a.nickname && <span className="text-muted-foreground"> · {a.nickname}</span>}
                                            </div>
                                            <div className="text-muted-foreground font-mono text-xs">{a.tag}</div>
                                        </div>
                                        {a.owned_since && (
                                            <div className="text-muted-foreground hidden text-xs sm:block">
                                                {t('asset_owned_since')}: <span className="font-mono">{a.owned_since}</span>
                                            </div>
                                        )}
                                        <AssetStatusBadge status={a.status} t={t} />
                                        {a.status === 'deployed' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => onReturn(a.id, a.model, a.tag)}
                                                disabled={requestReturn.isPending && requestReturn.variables?.id === a.id}
                                            >
                                                <Undo2 className="h-4 w-4" />
                                                {t('asset_return')}
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
