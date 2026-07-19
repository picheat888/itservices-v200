import type { AccessKind, AccessMember, ApiEnvelope, EmailGroup, EmployeeAccess, FileShare, SocialPlatform, Software } from '@/shared/types';
import { ensureCsrf, http } from '@/shared/lib/http';

async function mutate<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

/** True when a payload carries a File (e.g. a software logo) and must go multipart. */
function hasFile(payload: Record<string, unknown>): boolean {
    return Object.values(payload).some((v) => v instanceof File);
}

/** Build multipart FormData from a flat payload, skipping null/undefined values. */
function toFormData(payload: Record<string, unknown>): FormData {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        if (typeof v === 'boolean') {
            fd.append(k, v ? '1' : '0');
        } else {
            fd.append(k, v as string | Blob);
        }
    });
    return fd;
}

export const accessApi = {
    emailGroups: () => http.get<ApiEnvelope<EmailGroup[]>>('/email-groups').then((r) => r.data.data),
    fileShares: () => http.get<ApiEnvelope<FileShare[]>>('/file-shares').then((r) => r.data.data),
    socialPlatforms: () => http.get<ApiEnvelope<SocialPlatform[]>>('/social-platforms').then((r) => r.data.data),
    software: () => http.get<ApiEnvelope<Software[]>>('/software').then((r) => r.data.data),

    members: (kind: AccessKind, id: number) =>
        http.get<ApiEnvelope<AccessMember[]>>(`/${kind}/${id}/members`).then((r) => r.data.data),

    createResource: async (kind: AccessKind, payload: Record<string, unknown>) => {
        if (!hasFile(payload)) return mutate<EmailGroup | FileShare | SocialPlatform | Software>('post', `/${kind}`, payload);
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<Software>>(`/${kind}`, toFormData(payload));
        return data.data;
    },
    updateResource: async (kind: AccessKind, id: number, payload: Record<string, unknown>) => {
        if (!hasFile(payload)) return mutate('put', `/${kind}/${id}`, payload);
        // Multipart can't be sent as PUT by browsers — spoof it so Laravel routes correctly.
        await ensureCsrf();
        const fd = toFormData(payload);
        fd.append('_method', 'PUT');
        const { data } = await http.post<ApiEnvelope<Software>>(`/${kind}/${id}`, fd);
        return data.data;
    },
    removeResource: (kind: AccessKind, id: number) => mutate<void>('delete', `/${kind}/${id}`),

    addMember: (kind: AccessKind, id: number, payload: { employee_id: number; access_level?: string | null; purpose?: string | null }) =>
        mutate<AccessMember>('post', `/${kind}/${id}/members`, payload),
    revokeMember: (kind: AccessKind, id: number, membershipId: number) =>
        mutate<void>('post', `/${kind}/${id}/members/${membershipId}/revoke`),

    // Set/clear an email group's owner (the workflow approver) — separate from members.
    setEmailGroupOwner: (id: number, ownerEmployeeId: number | null) =>
        mutate<EmailGroup>('put', `/email-groups/${id}/owner`, { owner_employee_id: ownerEmployeeId }),

    // Set/clear a file share's owner — same drawer tier as email groups, but optional.
    setFileShareOwner: (id: number, ownerEmployeeId: number | null) =>
        mutate<FileShare>('put', `/file-shares/${id}/owner`, { owner_employee_id: ownerEmployeeId }),

    employeeAccess: (employeeId: number) =>
        http.get<ApiEnvelope<EmployeeAccess>>(`/employees/${employeeId}/access`).then((r) => r.data.data),
};
