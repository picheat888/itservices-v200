import type { ApiEnvelope, User, UserPreferences } from '@/types';
import { ensureCsrf, http } from './http';

export const preferencesApi = {
    update: async (prefs: Partial<UserPreferences>): Promise<User> => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<User>>('/preferences', prefs);
        return data.data;
    },
};
