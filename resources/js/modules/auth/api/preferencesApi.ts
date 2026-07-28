import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, User, UserPreferences } from '@/shared/types';

export const preferencesApi = {
    update: async (prefs: Partial<UserPreferences>): Promise<User> => {
        await ensureCsrf();
        const { data } = await http.put<ApiEnvelope<User>>('/preferences', prefs);
        return data.data;
    },
};
