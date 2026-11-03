// Public API of the monitor module: the TV page and the Settings hooks.
import { lazyPage } from '@/shared/lib/lazy-page';
export { useMonitorDevice, usePairMonitor, useUnpairMonitor } from './hooks/use-monitor';
export type { MonitorDeviceStatus } from './types';

export const MonitorPage = lazyPage(() => import('./pages/monitor-page'));
