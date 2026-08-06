import { ensureCsrf, http } from '@/shared/lib/http';
import type { ApiEnvelope, ServiceRequestType, Workflow, WorkflowStep } from '@/shared/types';

export interface WorkflowUpdatePayload {
    name?: string;
    active?: boolean;
    auto_ticket?: boolean;
    steps: Omit<WorkflowStep, 'id' | 'position'>[];
}

/** One resolved row of the editor's "test with employee" preview. */
export interface ResolvedPreviewRow {
    position: number;
    actor_type: WorkflowStep['actor_type'];
    kind: WorkflowStep['kind'];
    label: string;
    approver_employee_id: number | null;
    approver_name: string | null;
    approver_position: string | null;
    status: 'waiting' | 'skipped';
    note: string | null;
}

export interface WorkflowPreviewResponse {
    employee: { id: number; name: string; position: string | null; department: string | null };
    rows: ResolvedPreviewRow[];
}

async function mutate<T>(method: 'post' | 'put', url: string, body?: unknown): Promise<T> {
    await ensureCsrf();
    const { data } = await http.request<ApiEnvelope<T>>({ method, url, data: body });
    return (data as ApiEnvelope<T>)?.data;
}

/** One row of the editor's "test with" employee picker. */
export interface WorkflowEmployeeOption {
    id: number;
    code: string;
    name: string;
    position: string | null;
    department: string | null;
}

/** The definitions plus the window their measured decision times were taken over. */
export interface WorkflowListResponse {
    data: Workflow[];
    meta: { measure_days: number };
}

export const workflowApi = {
    list: () => http.get<WorkflowListResponse>('/workflows').then((r) => r.data),
    employeeOptions: () => http.get<ApiEnvelope<WorkflowEmployeeOption[]>>('/workflows/employee-options').then((r) => r.data.data),
    update: (id: number, payload: WorkflowUpdatePayload) => mutate<Workflow>('put', `/workflows/${id}`, payload),
    preview: (payload: { request_type: ServiceRequestType; employee_id: number; steps: Omit<WorkflowStep, 'id' | 'position'>[] }) =>
        mutate<WorkflowPreviewResponse>('post', '/workflows/preview', payload),
};
