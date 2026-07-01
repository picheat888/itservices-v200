import type { AccessKind, AccessMember, ApiEnvelope, EmailGroup, EmployeeAccess, FileShare, SocialPlatform } from '@/shared/types';
import { ensureCsrf, http } from './http';

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const accessApi = {
    emailGroups: () => http.get<ApiEnvelope<EmailGroup[]>>('/email-groups').then((r) => r.data.data),
    fileShares: () => http.get<ApiEnvelope<FileShare[]>>('/file-shares').then((r) => r.data.data),
    socialPlatforms: () => http.get<ApiEnvelope<SocialPlatform[]>>('/social-platforms').then((r) => r.data.data),

    members: (kind: AccessKind, id: number) =>
        http.get<ApiEnvelope<AccessMember[]>>(`/${kind}/${id}/members`).then((r) => r.data.data),

    createResource: (kind: AccessKind, payload: Record<string, unknown>) => mutate<EmailGroup | FileShare | SocialPlatform>('post', `/${kind}`, payload),
    updateResource: (kind: AccessKind, id: number, payload: Record<string, unknown>) => mutate('put', `/${kind}/${id}`, payload),
    removeResource: (kind: AccessKind, id: number) => mutate<void>('delete', `/${kind}/${id}`),

    addMember: (kind: AccessKind, id: number, payload: { employee_id: number; access_level?: string | null; purpose?: string | null }) =>
        mutate<AccessMember>('post', `/${kind}/${id}/members`, payload),
    revokeMember: (kind: AccessKind, id: number, membershipId: number) =>
        mutate<void>('post', `/${kind}/${id}/members/${membershipId}/revoke`),

    employeeAccess: (employeeId: number) =>
        http.get<ApiEnvelope<EmployeeAccess>>(`/employees/${employeeId}/access`).then((r) => r.data.data),
};
