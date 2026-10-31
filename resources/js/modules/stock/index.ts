import { lazyPage } from '@/shared/lib/lazy-page';
export { STOCK_STATUS_TONE, StockLevelBar } from './components/stock-level-bar';
export { MV_META } from './pages/shared';
export const StockPage = lazyPage(() => import('./pages'));
export const ItemHistoryPage = lazyPage(() => import('./pages/item-history'));
export const LotHistoryPage = lazyPage(() => import('./pages/lot-history'));
