// Calls behind the My Profile sign-ins tab: this account's devices, ending one, and its last login events.
import type { LoginEventRow, UserDevice } from '@/modules/auth';
import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope } from '@/shared/types';

interface DevicesResponse {
    data: UserDevice[];
    /** 0 = no limit. */
    meta: { limit: number };
}

export const devicesApi = {
    list: () => http.get<DevicesResponse>('/me/devices').then((r) => ({ devices: r.data.data, limit: r.data.meta.limit })),

    async end(id: number): Promise<void> {
        await ensureCsrf();
        await http.delete(`/me/devices/${id}`);
    },

    events: () => http.get<ApiEnvelope<LoginEventRow[]>>('/me/login-events').then((r) => r.data.data),
};
