import type { ApiEnvelope, User } from '@/types';
import { ensureCsrf, http } from './http';

export interface LoginPayload {
    login: string;
    password: string;
    remember?: boolean;
}

export const authApi = {
    async login(payload: LoginPayload): Promise<User> {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<User>>('/login', payload);
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
};
