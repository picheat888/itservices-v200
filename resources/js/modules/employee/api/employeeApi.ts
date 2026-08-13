import { ensureCsrf, http } from '@/shared/lib/http';
import type {
    ApiEnvelope,
    ApproverNode,
    Employee,
    EmployeeAccess,
    OrgChartNode,
    ServiceRequestOrigin,
    ServiceRequestStatus,
    ServiceRequestType,
    TicketCategory,
    TicketPriority,
    TicketStatus,
} from '@/shared/types';
import { mutate } from './http-helpers';

/** One month on the hiring-trend chart. `month` is 'YYYY-MM'. */
export interface EmployeeHiresMonth {
    month: string;
    count: number;
}

export interface EmployeeSummary {
    total: number;
    new_hires: number;
    active: number;
    resigned: number;
    resigned_this_year: number;
    /** Active employees still without a login account — drives the Directory tab badge. */
    no_account: number;
    hires_by_month: EmployeeHiresMonth[];
    recent: Employee[];
    recent_resignations: Employee[];
}

/** A read-only asset row held by an employee — for the Employee detail's Assets tab. */
export interface EmployeeHeldAsset {
    id: number;
    asset_code: string;
    tag: string | null;
    model: string | null;
    type: string | null;
    type_th: string | null;
    serial: string | null;
    status: string;
    owned_since: string | null;
}

/** A read-only ticket row requested by an employee — for the Employee detail's Tickets tab. */
export interface EmployeeRequestedTicket {
    id: number;
    ticket_no: string;
    subject: string;
    category: TicketCategory;
    priority: TicketPriority | null;
    status: TicketStatus;
    created_at: string | null;
}

/**
 * A read-only service request row owned by an employee — for the Employee detail's Requests tab.
 * No `title`: the table writes the request's name in the reader's language with `requestTitle()`,
 * so the server's canonical English title would only put the filer's language on screen.
 */
export interface EmployeeServiceRequest {
    id: number;
    reference: string;
    type: ServiceRequestType;
    origin: ServiceRequestOrigin;
    status: ServiceRequestStatus;
    created_at: string | null;
}

/**
 * One row of an import dry-run: the master data the free-text columns resolved to,
 * plus the errors that row would raise. `errors` empty = the row is ready to save.
 */
export interface ImportPreviewRow {
    row: number;
    employee_code: string | null;
    name: string;
    name_th: string | null;
    email: string | null;
    phone: string | null;
    department: string | null;
    section: string | null;
    position: string | null;
    joined_at: string | null;
    report_to: string | null;
    errors: string[];
}

/** POST /employees/import/preview — the whole file checked, nothing written. */
export interface ImportPreview {
    data: ImportPreviewRow[];
    errors: { row: number; message: string }[];
    meta: {
        total: number;
        valid: number;
        invalid: number;
        /** Columns in the file the import has no field for — ignored, but worth saying so. */
        ignored_columns: string[];
    };
}

export interface EmployeePageMeta {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}

export interface EmployeePageResponse {
    data: Employee[];
    meta: EmployeePageMeta;
}

/** PUT /employees/{id}/credentials — username edit and/or password reset for an existing account. */
export interface UpdateCredentialsPayload {
    username?: string;
    reset_password?: boolean;
    password?: string;
    force_change?: boolean;
}

/**
 * What came of the day-one service requests: one entry per service that was
 * filed, and one per service that could not be (a closed workflow, say). The
 * employee is saved either way.
 */
export interface OnboardingResult {
    created: { service: string; id: number; reference: string | null }[];
    failed: { service: string; message: string }[];
}

/**
 * One field a day-one service asks for, straight from the Request module's schema.
 * `options` is filled for a select; a `managed` field's values are request_option ids,
 * so IT adding a device type under Settings → Request data shows up here on its own.
 */
export interface OnboardingServiceField {
    key: string;
    label_en: string;
    label_th: string;
    input: 'select' | 'email' | 'text' | 'number' | 'date';
    required?: boolean;
    placeholder?: string;
    mono?: boolean;
    options?: { value: string; label_en: string; label_th: string }[];
}

/** What each day-one service needs before it can be requested. */
export interface OnboardingServiceSchema {
    service: string;
    fields: OnboardingServiceField[];
}

/**
 * Whether those requests could be routed at all, asked before the employee exists.
 *
 * `reason` is a code — a ChainBlockReason, or `workflow_inactive` — not a sentence,
 * so the form writes it out in the reader's language (same contract the submit path
 * uses for a refused reporting line). `resigned_in_chain` is filled only for the
 * resigned case: that message is useless without naming whose record to fix.
 */
export interface OnboardingPrecheck {
    can_request: boolean;
    reason: string | null;
    blocked_services: string[];
    resigned_in_chain: { id: number; name: string; name_th: string | null; position: string | null }[];
}

export interface EmployeePayload {
    first_name: string;
    last_name: string;
    first_name_th?: string | null;
    last_name_th?: string | null;
    code?: string;
    department_id?: number | null;
    position_id?: number | null;
    section_id?: number | null;
    manager_id?: number | null;
    email?: string | null;
    username?: string | null;
    phone?: string | null;
    joined_at?: string | null;
    photo?: File | null;
    /** Day-one services to request for a new hire, each with the detail it asks for (create only). */
    services?: Record<string, Record<string, string>>;
    onboarding_note?: string | null;
}

/**
 * Appends one value under Laravel's bracket notation, recursing into arrays and plain
 * objects. `services` is a map of service → its fields, so it has to arrive as
 * `services[computer][device_id]=3`; a plain append would flatten the whole thing into
 * the string "[object Object]" and the required-field rules would fire on every service.
 */
function appendField(fd: FormData, key: string, value: unknown): void {
    if (value === null || value === undefined) return;
    // File extends Blob, so an uploaded photo lands here rather than in the object branch.
    if (value instanceof Blob) {
        fd.append(key, value);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => appendField(fd, `${key}[]`, item));
        return;
    }
    if (typeof value === 'object') {
        Object.entries(value as Record<string, unknown>).forEach(([k, v]) => appendField(fd, `${key}[${k}]`, v));
        return;
    }
    fd.append(key, String(value));
}

function toFormData(payload: EmployeePayload): FormData {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => appendField(fd, k, v));
    return fd;
}

function withoutPhoto(payload: EmployeePayload): Omit<EmployeePayload, 'photo'> {
    const copy = { ...payload };
    delete copy.photo;
    return copy;
}

export const employeeApi = {
    list: () => http.get<ApiEnvelope<Employee[]>>('/employees').then((r) => r.data.data),
    get: (id: number) => http.get<ApiEnvelope<Employee>>(`/employees/${id}`).then((r) => r.data.data),
    // Assets the employee currently holds (read-only, gated by employees.view).
    assets: (id: number) => http.get<ApiEnvelope<EmployeeHeldAsset[]>>(`/employees/${id}/assets`).then((r) => r.data.data),
    access: (id: number) => http.get<ApiEnvelope<EmployeeAccess>>(`/employees/${id}/access`).then((r) => r.data.data),
    tickets: (id: number) => http.get<ApiEnvelope<EmployeeRequestedTicket[]>>(`/employees/${id}/tickets`).then((r) => r.data.data),
    // Service requests the employee owns — filed by themselves or for them (onboarding).
    requests: (id: number) => http.get<ApiEnvelope<EmployeeServiceRequest[]>>(`/employees/${id}/requests`).then((r) => r.data.data),
    summary: () => http.get<EmployeeSummary>('/employees/summary').then((r) => r.data),
    listDirectory: (params: { page: number; per_page: number; search?: string; department_id?: string; status?: string }) =>
        http.get<EmployeePageResponse>('/employees', { params }).then((r) => r.data),
    /**
     * Creates the employee and returns it together with what became of the day-one
     * service requests — the employee is saved even when one of those fails, so the
     * caller has to be able to tell the difference.
     */
    create: async (payload: EmployeePayload) => {
        await ensureCsrf();
        // Multipart when a photo is attached, plain JSON otherwise.
        const body = payload.photo instanceof File ? toFormData(payload) : withoutPhoto(payload);
        const { data } = await http.post<ApiEnvelope<Employee> & { onboarding?: OnboardingResult }>('/employees', body);
        return { employee: data.data, onboarding: data.onboarding ?? null };
    },
    /** Can the day-one services be routed for somebody reporting to this manager? */
    onboardingPrecheck: (params: { manager_id: number | null; position_id: number | null }) =>
        http.get<OnboardingPrecheck>('/employees/onboarding-precheck', { params }).then((r) => r.data),
    /** The detail each day-one service asks for, so Step 3 can collect it. */
    onboardingServices: () => http.get<ApiEnvelope<OnboardingServiceSchema[]>>('/employees/onboarding-services').then((r) => r.data.data),
    update: async (id: number, payload: EmployeePayload) => {
        await ensureCsrf();
        // Multipart (spoofed PUT) when a new photo is attached, JSON otherwise.
        if (payload.photo instanceof File) {
            const fd = toFormData(payload);
            fd.append('_method', 'PUT');
            const { data } = await http.post<ApiEnvelope<Employee>>(`/employees/${id}`, fd);
            return data.data;
        }
        const { data } = await http.put<ApiEnvelope<Employee>>(`/employees/${id}`, withoutPhoto(payload));
        return data.data;
    },
    approvalChain: (id: number) => http.get<ApiEnvelope<ApproverNode[]>>(`/employees/${id}/approval-chain`).then((r) => r.data.data),
    orgChart: () => http.get<ApiEnvelope<OrgChartNode[]>>('/employees/org-chart').then((r) => r.data.data),
    resign: (id: number, reason: string, lastDay: string | null) =>
        mutate<Employee>('post', `/employees/${id}/resign`, { reason, last_day: lastDay }),
    cancelResign: (id: number) => mutate<Employee>('post', `/employees/${id}/cancel-resign`),
    /** Manage an existing account: change username and/or reset the password (returns new_password when reset). */
    updateCredentials: async (id: number, payload: UpdateCredentialsPayload) => {
        // NOTE: this endpoint returns { message, new_password } at the top level
        // (not wrapped in an ApiEnvelope `data` key), so it must NOT go through
        // mutate() — that unwraps `.data` and would yield undefined.
        await ensureCsrf();
        const { data } = await http.put<{ message: string; new_password?: string }>(`/employees/${id}/credentials`, payload);
        return data;
    },
    setCredentials: async (id: number, payload: { username: string; password: string; password_confirmation: string; force_change: boolean }) => {
        await ensureCsrf();
        const { data } = await http.post<ApiEnvelope<{ message: string }>>(`/employees/${id}/credentials`, payload);
        return data;
    },
    downloadImportTemplate: () => http.get('/employees/import-template', { responseType: 'blob' }).then((r) => r.data as Blob),
    /** Dry-run: validates and resolves the file with the real import rules, writing nothing. */
    previewImport: async (file: File) => {
        await ensureCsrf();
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await http.post<ImportPreview>('/employees/import/preview', fd);
        return data;
    },
    import: async (file: File) => {
        await ensureCsrf();
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await http.post<{ message: string; imported: number }>('/employees/import', fd);
        return data;
    },
};
