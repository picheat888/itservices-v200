import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope } from '@/shared/types';

export interface RoleRow {
    value: string;
    label: string;
    color: string;
    is_super: boolean;
    is_system: boolean;
    members: number;
    /** How many Role Groups point at this role — deletion is refused while any do. */
    groups: number;
    permissions: string[];
}

export interface PermissionMatrix {
    catalog: Record<string, string[]>;
    roles: RoleRow[];
}

export interface AuditDetails {
    /** Permission keys that were added */
    added?: string[];
    /** Permission keys that were removed */
    removed?: string[];
    /** Previous value name */
    from?: string;
    /** New value name */
    to?: string;
    /** Field-level before/after diff: { field: { from, to } } (from AuditLog::changes) */
    changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface AuditEntry {
    id: number;
    user_name: string | null;
    action: string;
    target: string | null;
    details: AuditDetails | null;
    created_at: string;
}

export interface RoleMember {
    id: number;
    name: string;
    username: string;
    email: string;
}

export interface AuditMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    /** Distinct actor names, for the actor filter dropdown. */
    users?: string[];
}

export interface AuditFilters {
    q?: string;
    category?: string;
    user?: string;
}

export interface AuditLogsResponse {
    data: AuditEntry[];
    meta: AuditMeta;
}

export interface GroupRole {
    id: number;
    name: string;
    role: string | null;
    role_label: string | null;
    employee_ids: number[];
    employees: { id: number; name: string; code: string }[];
    member_count: number;
}

export interface GroupRoleListResponse {
    data: GroupRole[];
    default_group_id: number | null;
}

export interface GroupRolePayload {
    name: string;
    role: string | null;
    employee_ids: number[];
}

async function send<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const permissionApi = {
    matrix: () => http.get<ApiEnvelope<PermissionMatrix>>('/permissions').then((r) => r.data.data),
    updateRole: (role: string, permissions: string[]) => send<PermissionMatrix>('put', `/permissions/${role}`, { permissions }),
    auditLogs: (page: number, perPage: number, filters: AuditFilters = {}) =>
        http
            .get<AuditLogsResponse>('/audit-logs', {
                params: {
                    page,
                    per_page: perPage,
                    q: filters.q || undefined,
                    category: filters.category && filters.category !== 'all' ? filters.category : undefined,
                    user: filters.user && filters.user !== 'all' ? filters.user : undefined,
                },
            })
            .then((r) => r.data),
};

export const roleApi = {
    create: (payload: { name: string; color: string }) => send<RoleRow>('post', '/roles', payload),
    update: (key: string, payload: { name: string; color: string }) => send<RoleRow>('put', `/roles/${key}`, payload),
    remove: (key: string) => send<void>('delete', `/roles/${key}`),
};

export const groupRoleApi = {
    list: () => http.get<GroupRoleListResponse>('/group-roles').then((r) => r.data),
    create: (payload: GroupRolePayload) => send<GroupRole>('post', '/group-roles', payload),
    update: (id: number, payload: GroupRolePayload) => send<GroupRole>('put', `/group-roles/${id}`, payload),
    remove: (id: number) => send<void>('delete', `/group-roles/${id}`),
    /**
     * Answers with the whole list (the endpoint returns index()), and that answer is
     * written straight into the list cache — so it must keep the list's shape.
     *
     * NOT send(): that helper unwraps the envelope's `data`, which here IS the array of
     * groups. The cache then held an array where the page reads `data.data`, so saving a
     * default emptied the screen until the next fetch — the response was right, the
     * unwrapping was one layer too deep. `send<GroupRoleListResponse>` could not catch it
     * either: it returns T by assertion, so the type said envelope while the value was an
     * array.
     */
    setDefault: async (groupId: number | null): Promise<GroupRoleListResponse> => {
        await ensureCsrf();
        const { data } = await http.put<GroupRoleListResponse>('/group-roles-default', { group_id: groupId });

        return data;
    },
};
