import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope } from '@/shared/types';

/** CSRF-safe write request that unwraps the standard `{ data }` envelope. */
export async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}
