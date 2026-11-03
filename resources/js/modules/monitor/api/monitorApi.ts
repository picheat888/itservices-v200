// Monitor TV calls on their own axios instance, so a 401 or a dropped network never triggers the app's login redirect or outage screen.
import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope } from '@/shared/types';
import axios from 'axios';
import type { MonitorBoard, MonitorDeviceStatus, MonitorPairingCode, MonitorPairingState } from '../types';

export const MONITOR_TOKEN_HEADER = 'X-Monitor-Token';

const tv = axios.create({
    baseURL: '/api',
    withCredentials: true,
    withXSRFToken: true,
    timeout: 15_000,
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
});

export const monitorApi = {
    // A paired TV sends its token; a signed-in viewer reads the session route
    board: (token: string | null) =>
        (token
            ? tv.get<ApiEnvelope<MonitorBoard>>('/monitor/board', { headers: { [MONITOR_TOKEN_HEADER]: token } })
            : tv.get<ApiEnvelope<MonitorBoard>>('/monitor/live')
        ).then((r) => r.data.data),
    requestCode: async () => {
        await ensureCsrf();
        return tv.post<ApiEnvelope<MonitorPairingCode>>('/monitor/pairings').then((r) => r.data.data);
    },
    pollPairing: (pairingId: string) => tv.get<ApiEnvelope<MonitorPairingState>>(`/monitor/pairings/${pairingId}`).then((r) => r.data.data),

    // Settings → จอ Monitor (signed-in admin, regular client)
    deviceStatus: () => http.get<ApiEnvelope<MonitorDeviceStatus>>('/settings/monitor').then((r) => r.data.data),
    pair: async (code: string) => {
        await ensureCsrf();
        return http.post<ApiEnvelope<MonitorDeviceStatus>>('/settings/monitor/pair', { code }).then((r) => r.data.data);
    },
    unpair: async () => {
        await ensureCsrf();
        return http.delete<ApiEnvelope<MonitorDeviceStatus>>('/settings/monitor/device').then((r) => r.data.data);
    },
};

/** True when the server no longer knows this TV's token. */
export const isUnpaired = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 401;
