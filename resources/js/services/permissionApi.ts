import type { ApiEnvelope } from '@/types';
import { ensureCsrf, http } from './http';

export interface RoleRow {
    value: string;
    label: string;
    color: string;
    is_super: boolean;
    is_system: boolean;
    members: number;
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
    auditLogs: (page: number, perPage: number) =>
        http.get<AuditLogsResponse>('/audit-logs', { params: { page, per_page: perPage } }).then((r) => r.data),
};

export const roleApi = {
    create: (payload: { name: string; color: string }) => send<RoleRow>('post', '/roles', payload),
    update: (key: string, payload: { name: string; color: string }) => send<RoleRow>('put', `/roles/${key}`, payload),
    remove: (key: string) => send<void>('delete', `/roles/${key}`),
};

export const groupRoleApi = {
    list: () => http.get<{ data: GroupRole[]; default_group_id: number | null }>('/group-roles').then((r) => r.data),
    create: (payload: GroupRolePayload) => send<GroupRole>('post', '/group-roles', payload),
    update: (id: number, payload: GroupRolePayload) => send<GroupRole>('put', `/group-roles/${id}`, payload),
    remove: (id: number) => send<void>('delete', `/group-roles/${id}`),
    setDefault: (groupId: number | null) => send<GroupRoleListResponse>('put', '/group-roles-default', { group_id: groupId }),
};
