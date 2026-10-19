import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, User } from '@/shared/types';

interface SignInOptions {
    remember?: boolean;
    /** True on a touch screen, so an iPad that reports as a Mac is recorded as iPadOS. */
    touch?: boolean;
}

/** A password sign-in, or the one that finishes the device-limit dialog (the pending token stands in for the password). */
export type LoginPayload = ({ login: string; password: string } | { pending: string }) & SignInOptions;

/** One signed-in device (UserDeviceResource). */
export interface UserDevice {
    id: number;
    os: string;
    browser: string;
    ip: string | null;
    location: string | null;
    signed_in_at: string;
    last_active_at: string | null;
    remembered: boolean;
    remember_expires_at: string | null;
    current: boolean;
}

/** The 409 body of a sign-in that would pass the account's device limit. */
export interface DeviceLimitResponse {
    limit: number;
    pending: string;
    devices: UserDevice[];
}

export type LoginEventType = 'signed_in' | 'failed' | 'locked' | 'signed_out' | 'forced_out';

export type DeviceEndReason = 'third_device' | 'profile' | 'limit' | 'idle_timeout' | 'password_changed' | 'account_closed' | 'signed_out';

/** One row of the login log (LoginEventResource). */
export interface LoginEventRow {
    id: number;
    created_at: string;
    event: LoginEventType;
    reason: DeviceEndReason | null;
    remembered: boolean;
    login_name: string | null;
    user: { id: number; name: string; name_th: string | null; username: string } | null;
    ip: string | null;
    location: string | null;
    os: string | null;
    browser: string | null;
}

export interface ChangePasswordPayload {
    /** Omitted on a forced change — the API waives it while must_change_password is set. */
    current_password?: string;
    password: string;
    password_confirmation: string;
}

export const authApi = {
    async login(payload: LoginPayload): Promise<User> {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<User>>('/login', payload);
        return data.data;
    },

    /** Signs one device out from the device-limit dialog, before this browser has a session. */
    async signOutPendingDevice(id: number, pending: string): Promise<UserDevice> {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<UserDevice>>(`/login/devices/${id}/sign-out`, { pending });
        return data.data;
    },

    async logout(): Promise<void> {
        await http.post('/logout');
    },

    async me(): Promise<User> {
        const { data } = await http.get<ApiEnvelope<User>>('/me');
        return data.data;
    },

    async updateProfile(form: FormData): Promise<User> {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<User>>('/profile', form);
        return data.data;
    },

    async changePassword(payload: ChangePasswordPayload): Promise<User> {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<User>>('/password', payload);
        return data.data;
    },

    /** Touches the server session so CheckSessionTimeout resets _sec_last_activity. */
    async ping(): Promise<void> {
        await http.get('/session/ping');
    },
};
