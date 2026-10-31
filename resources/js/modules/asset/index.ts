import { lazyPage } from '@/shared/lib/lazy-page';
export { assetApi } from './api/assetApi';
export type { AssetPageMeta, AssetPageResponse, AssetPayload, AssetTransferPayload } from './api/assetApi';
export { AssetDetailDrawer } from './components/asset-detail-drawer';
export { AssetStatusBadge, AssetTypeIcon } from './components/asset-meta';
export { AssetTagBadge } from './components/asset-tag-badge';
export { ACCEPT_KEY, useAssetMutations, useAssets, useAssetSummary, useAssetTransfers, useMyAssets } from './hooks/use-assets';
export const AssetsPage = lazyPage(() => import('./pages'));
