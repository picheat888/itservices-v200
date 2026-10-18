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
    /** Hash of the stored set; a save sends the one its draft started from (409 role_changed when stale). */
    version: string;
}

export interface PermissionMatrix {
    catalog: Record<string, string[]>;
    roles: RoleRow[];
}

export interface AuditRoleChange {
    name: string;
    from: string | null;
    to: string | null;
}

export interface AuditDetails {
    /** Permission keys that were added, or member names on a role group entry */
    added?: string[];
    /** Permission keys that were removed, or member names on a role group entry */
    removed?: string[];
    /** Login accounts whose role a role group write changed */
    role_changes?: AuditRoleChange[];
    /** Previous value name */
    from?: string;
    /** New value name */
    to?: string;
    /** Field-level before/after diff: { field: { from, to } } (from AuditLog::changes) */
    changes?: Record<string, { from: unknown; to: unknown }>;
    /** The records one bulk action touched, by their code — so "5 assets" can name the five. */
    items?: string[];
    /** Anything else worth recording about the action, as raw key → value. */
    facts?: Record<string, string>;
    /** The row as it stood when it was deleted (AuditLog::recordDeleted), foreign keys as names. */
    snapshot?: Record<string, unknown>;
}

export interface AuditEntry {
    id: number;
    user_name: string | null;
    action: string;
    target: string | null;
    /** Morph alias or class name of the record the entry is about. */
    subject_type: string | null;
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
    search?: string;
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
    member_count: number;
    /** The signed-in user's own employee is a member: nobody may then change its role, members or delete it. */
    includes_me: boolean;
}

/** A role a Role Group can be given, with its keys so roles above the caller's ceiling grey out. */
export interface GroupRoleOption {
    key: string;
    name: string | null;
    color: string | null;
    is_super: boolean;
    permissions: string[];
}

export interface GroupRoleListResponse {
    data: GroupRole[];
    default_group_id: number | null;
    /** Every role a group can be given (manage_groups is enough to read them). */
    roles: GroupRoleOption[];
}

interface GroupRoleFields {
    name: string;
    role: string | null;
}

/** A new group sends everyone in employee_ids. */
export type GroupRoleCreatePayload = GroupRoleFields & { employee_ids: number[]; add_ids?: never; remove_ids?: never };

/** An edit sends only who joined (add_ids) and who left (remove_ids). */
export type GroupRoleUpdatePayload = GroupRoleFields & { add_ids: number[]; remove_ids: number[]; employee_ids?: never };

export type GroupRolePayload = GroupRoleCreatePayload | GroupRoleUpdatePayload;

/** A person in the Role Group dialog; `group` is the group they sit in now, `protected` = only a Super admin may move them, `is_me` = the caller's own employee. */
export interface GroupMember {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    department: string | null;
    department_th: string | null;
    group_id: number | null;
    group: string | null;
    protected: boolean;
    is_me: boolean;
}

export interface GroupMemberPage {
    data: GroupMember[];
    meta: {
        total: number;
        per_page: number;
        current_page: number;
        last_page: number;
        /** Candidates with a department only: how many of them the caller may add. */
        addable?: number;
    };
}

export interface GroupCandidateParams {
    groupId: number | null;
    search: string;
    departmentId: number | null;
    page: number;
}

async function send<T>(method: 'post' | 'put' | 'delete', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

export const permissionApi = {
    matrix: () => http.get<ApiEnvelope<PermissionMatrix>>('/permissions').then((r) => r.data.data),
    updateRole: (role: string, permissions: string[], version: string) =>
        send<PermissionMatrix>('put', `/permissions/${role}`, { permissions, version }),
    auditLogs: (page: number, perPage: number, filters: AuditFilters = {}) =>
        http
            .get<AuditLogsResponse>('/audit-logs', {
                params: {
                    page,
                    per_page: perPage,
                    search: filters.search || undefined,
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
    duplicate: (key: string, payload: { name: string; color: string }) =>
        send<{ key: string; name: string }>('post', `/roles/${key}/duplicate`, payload),
};

export const groupRoleApi = {
    list: () => http.get<GroupRoleListResponse>('/group-roles').then((r) => r.data),
    create: (payload: GroupRoleCreatePayload) => send<GroupRole>('post', '/group-roles', payload),
    update: (id: number, payload: GroupRoleUpdatePayload) => send<GroupRole>('put', `/group-roles/${id}`, payload),
    remove: (id: number) => send<void>('delete', `/group-roles/${id}`),
    members: (id: number, search: string, page: number) =>
        http.get<GroupMemberPage>(`/group-roles/${id}/members`, { params: { search: search || undefined, page } }).then((r) => r.data),
    candidates: (p: GroupCandidateParams) =>
        http
            .get<GroupMemberPage>('/group-roles-candidates', {
                params: { group_id: p.groupId ?? undefined, search: p.search || undefined, department_id: p.departmentId ?? undefined, page: p.page },
            })
            .then((r) => r.data),
    /** Everyone in a department on one page (all=1), for "Everyone in …". */
    departmentCandidates: (groupId: number | null, departmentId: number) =>
        http
            .get<GroupMemberPage>('/group-roles-candidates', { params: { group_id: groupId ?? undefined, department_id: departmentId, all: 1 } })
            .then((r) => r.data.data),
    /** Returns the whole list in the list cache's shape; not send(), which would unwrap its `data`. */
    setDefault: async (groupId: number | null): Promise<GroupRoleListResponse> => {
        await ensureCsrf();
        const { data } = await http.put<GroupRoleListResponse>('/group-roles-default', { group_id: groupId });

        return data;
    },
};
