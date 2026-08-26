import { LucideIcon } from 'lucide-react';

export type Role = 'super' | 'admin' | 'hr' | 'user';

/**
 * The all-access role. It bypasses permission checks rather than being granted keys
 * (see useAuth's `can`), mirroring App\Enums\UserRole on the server. Compare against
 * this rather than writing the string, so the key lives in one place on each side.
 */
export const SUPER_ROLE: Role = 'super';

export type Lang = 'en' | 'th';
export type Density = 'compact' | 'normal' | 'cozy';
export type SidebarStyle = 'labeled' | 'icons';

export interface UserPreferences {
    dark: boolean;
    lang: Lang;
    density: Density;
    radius: number;
    sidebar: SidebarStyle;
    accent: string;
}

export interface User {
    id: number;
    name: string;
    email: string;
    username: string | null;
    role: Role;
    role_label: string;
    group_name: string | null;
    employee_id: number | null;
    employee_code: string | null;
    photo_url: string | null;
    phone: string | null;
    name_th: string | null;
    first_name: string | null;
    last_name: string | null;
    first_name_th: string | null;
    last_name_th: string | null;
    permissions: string[];
    preferences: UserPreferences;
    email_verified_at: string | null;
    password_expired: boolean;
    /** True when an admin set the current password — the user must replace it before continuing. */
    must_change_password: boolean;
}

export interface ApiEnvelope<T> {
    data: T;
    message: string;
}

export type EmployeeStatus = 'active' | 'resigned';

export interface Department {
    id: number;
    code: string;
    tag: string;
    name: string;
    name_th: string | null;
    count?: number;
    sections_count?: number;
}

export interface Section {
    id: number;
    code: string;
    department_id: number;
    name: string;
    name_th: string | null;
    department?: string;
    members_count?: number;
}

export interface Position {
    id: number;
    code: string;
    title: string;
    /** "Special position": employees in it may be saved without a department or a report-to. */
    allow_special_position: boolean;
    employees_count?: number;
}

export interface ApproverNode {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    photo_url: string | null;
    position: string | null;
    department: string | null;
    status: string;
}

export interface OrgChartNode {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    title: string | null;
    department: string | null;
    department_code: string | null;
    photo_url: string | null;
    manager_id: number | null;
    reports_count: number;
}

export interface LocationItem {
    id: number;
    name: string;
}

export interface Employee {
    id: number;
    code: string;
    first_name: string;
    last_name: string;
    first_name_th: string | null;
    last_name_th: string | null;
    // Composed full names from the API (read-only, derived from first/last).
    name: string;
    name_th: string | null;
    photo_url: string | null;
    department_id: number | null;
    position_id: number | null;
    manager_id: number | null;
    department: string | null;
    department_th: string | null;
    section_id: number | null;
    section: string | null;
    section_th?: string | null;
    position: string | null;
    email: string | null;
    phone: string | null;
    username: string | null;
    joined_at: string | null;
    status: EmployeeStatus;
    resign_reason: string | null;
    last_day: string | null;
    has_account: boolean;
    is_super_admin: boolean;
}

export type ContractType = 'software' | 'hardware' | 'service' | 'connectivity' | 'other';
/** Contract types whose contracts can have leased/owned assets linked to them. */
export const ASSET_LINKABLE_CONTRACT_TYPES: ContractType[] = ['hardware', 'connectivity', 'other'];
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
export type ContractStatus = 'active' | 'overdue' | 'cancelled' | 'expired';

export interface ContractAttachment {
    id: number;
    name: string;
    size: number;
    url: string;
    created_at: string | null;
}

export interface ContractLinkedAsset {
    id: number;
    asset_code: string;
    name: string;
    type: string | null;
    serial: string | null;
    status: string | null;
    owner: string | null;
}

/** Asset offered by the contract form's link picker (free assets + the ones already linked here). */
export interface ContractLinkableAsset {
    id: number;
    asset_code: string;
    name: string;
    type: string;
    status: string;
}

export interface Contract {
    id: number;
    code: string;
    vendor: string;
    vendor_id: number | null;
    name: string;
    details: string | null;
    type: ContractType;
    start: string;
    end: string;
    value: number;
    value_display: string;
    total_value: number | null;
    total_value_display: string | null;
    billing_cycle: BillingCycle;
    status: ContractStatus;
    days_remaining: number;
    duration_months: number;
    duration_days: number;
    in_reminder: boolean;
    reminder_days: number | null;
    notify_150: boolean;
    notify_120: boolean;
    notify_90: boolean;
    notify_60: boolean;
    notify_45: boolean;
    notify_30: boolean;
    notify_7: boolean;
    notes: string | null;
    attachments: ContractAttachment[];
    linked_assets: ContractLinkedAsset[];
    cancelled_at: string | null;
    expired_at: string | null;
    cancel_reason: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface ContractSummary {
    total: number;
    active: number;
    expiring: number;
    expired: number;
    overdue: number;
    cancelled: number;
    annual_value: string;
    top_vendors: { vendor: string; amount: number }[];
    timeline: { id: number; code: string; name: string; vendor: string; end: string; days: number; in_reminder: boolean }[];
    action_queue: { id: number; code: string; name: string; vendor: string; days: number }[];
}

// Assets Management module
// Asset type is a free Master Data category (managed under Settings → Master Data).
// The known device names below still map to specific icons; anything else falls back to a generic icon.
export type AssetType = string;
export type AssetSource = 'purchased' | 'rented';
export type AssetStatus = 'ready' | 'pending_acceptance' | 'deployed' | 'common' | 'pending_return' | 'writeoff';

export interface Asset {
    id: number;
    /** The generated Asset code, e.g. INK-IT-26-0001. */
    asset_code: string;
    /** User-given "Tag" nickname to recognise the asset, separate from the Asset code. */
    tag: string | null;
    type: AssetType;
    /** Thai category name for locale-aware display; falls back to `type` when null. */
    type_th?: string | null;
    category_id: number | null;
    brand: string | null;
    brand_id: number | null;
    model: string | null;
    model_id: number | null;
    serial: string | null;
    source: AssetSource;
    status: AssetStatus;
    owner: string | null;
    owner_employee_id: number | null;
    /** Display name of the holder: employee full name, shared label, or null (pool). */
    owner_name: string | null;
    /** Job title of the holding employee (null for pool / shared assets). */
    owner_position: string | null;
    /** Department of the holding employee (read from the employee; null for pool / shared). */
    department: string | null;
    location: string | null;
    location_id: number | null;
    warehouse: string | null;
    warehouse_id: number | null;
    value: number;
    value_display: string;
    supplier: string | null;
    vendor_id: number | null;
    purchase_date: string | null;
    warranty_end: string | null;
    warranty_lifetime: boolean;
    contract_id: number | null;
    contract_code?: string | null;
    lease_start: string | null;
    lease_end: string | null;
    cover_end: string | null;
    registered_date: string | null;
    owned_since: string | null;
    notes: string | null;
    last_reason: string | null;
    created_at: string | null;
    updated_at: string | null;
    // Present only on the single-asset endpoint (GET /assets/{id}).
    transfers?: AssetTransferEntry[];
    tickets?: AssetTicket[];
}

/** One custody event (transfer / return-to-pool) in an asset's history. */
export interface AssetTransferEntry {
    id: number;
    date: string | null;
    from_owner: string | null;
    to_owner: string;
    reason: string | null;
    performed_by: string | null;
}

/** Compact repair-ticket row shown on an asset's "งานแจ้งซ่อม" tab. */
export interface AssetTicket {
    id: number;
    ticket_no: string;
    subject: string;
    category: TicketCategory;
    priority: TicketPriority | null;
    status: TicketStatus;
    assignee_name: string | null;
    created_at: string | null;
    resolved_at: string | null;
}

export interface AssetTransferLog {
    id: number;
    date: string | null;
    asset_tag: string;
    asset_model: string;
    from_owner: string | null;
    to_owner: string;
    reason: string | null;
    performed_by: string | null;
}

export interface AssetSummary {
    total: number;
    deployed: number;
    ready: number;
    pending_acceptance: number;
    pending_return: number;
    writeoff: number;
    total_value: number;
    by_type: { type: AssetType; count: number }[];
    top_value: Asset[];
    /**
     * Custody activity per month for the rolling 12-month window, oldest first. Every month
     * is present even when nothing happened in it, so the bars keep their place on the axis.
     * `returned` counts recalls too — both put the asset back in the pool.
     */
    activity_12m: { month: string; handover: number; returned: number }[];
}

// Ticket module types
export type TicketStatus = 'open' | 'in_progress' | 'completed' | 'canceled';
export type TicketCategory = 'hardware' | 'software' | 'network' | 'other';
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low';

export interface TicketAttachment {
    id: number;
    name: string;
    size: number;
    mime: string;
    url: string;
    created_at: string | null;
}

/** State of the SLA clock that currently matters (backend-computed; see App\Support\TicketSla). */
export type TicketSlaState = 'on_track' | 'at_risk' | 'breached' | 'met' | 'missed';

export interface TicketSlaSnapshot {
    /** ISO instants in local wall time (APP_TIMEZONE) — display via formatDateTime. */
    response_due_at: string;
    resolve_due_at: string;
    state: TicketSlaState;
    pct_elapsed: number;
}

export interface Ticket {
    id: number;
    ticket_no: string;
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority | null;
    status: TicketStatus;
    requester_id: number;
    requester_code?: string | null;
    requester_name?: string | null;
    assignee_id: number | null;
    assignee_name?: string | null;
    callback_phone: string | null;
    related_asset_id: number | null;
    related_asset_tag?: string | null;
    related_asset_tag_name?: string | null;
    related_asset_type?: string | null;
    related_asset_type_th?: string | null;
    related_asset_brand?: string | null;
    related_asset_model?: string | null;
    related_asset_serial?: string | null;
    take_note: string | null;
    resolution: string | null;
    sla?: TicketSlaSnapshot | null;
    responded_at: string | null;
    resolved_at: string | null;
    attachments?: TicketAttachment[];
    created_at: string | null;
    updated_at: string | null;
}

export interface TicketSummary {
    range_days: number;
    // Inbound / closed flow over the window, each with a trend vs the previous window
    // (created trends by absolute ticket count, resolved by percent change).
    created: number;
    created_delta_count: number;
    resolved: number;
    resolved_delta_count: number;
    // Point-in-time unresolved backlog (open + in progress).
    backlog: number;
    backlog_open: number;
    backlog_in_progress: number;
    // Active cases currently past their SLA deadline (right now, not window-scoped).
    sla_breached_now: number;
    // Window SLA % and its change in percentage points vs the previous window.
    sla_met_pct: number | null;
    sla_delta_pts: number | null;
    // Same pair for the first-response clock (tickets responded within the window).
    response_sla_met_pct: number | null;
    response_sla_delta_pts: number | null;
    // The configured response target in working minutes (Settings → Ticket & SLA).
    response_target_minutes: number;
    avg_response_minutes: number | null;
    // Change vs the previous window in minutes: negative = faster, positive = slower.
    avg_response_delta_minutes: number | null;
    by_category: { category: TicketCategory; count: number }[];
}

export interface NavItem {
    id: string;
    label: string;
    to: string;
    icon: LucideIcon;
    count?: number;
    roles?: Role[];
    permission?: string;
    anyOf?: string[];
}

export interface NavGroup {
    label: string;
    items: NavItem[];
}

// Master Data types
export interface Brand {
    id: number;
    name: string;
    description?: string | null;
}

export interface AssetModel {
    id: number;
    name: string;
    brand_id?: number | null;
    brand?: Brand | null;
    description?: string | null;
}

export interface Category {
    id: number;
    name: string;
    name_th?: string | null;
    /** Lucide icon name (e.g. "Laptop") used when this category is an asset type. */
    icon?: string | null;
    description?: string | null;
}

export interface Vendor {
    id: number;
    name: string;
    name_th?: string | null;
    contact?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
}

export interface Warehouse {
    id: number;
    name: string;
    description?: string | null;
}

export interface Unit {
    id: number;
    name: string;
    description?: string | null;
}

export interface WarrantyType {
    id: number;
    name: string;
    description?: string | null;
}

export type StockItemStatus = 'ok' | 'low' | 'out' | 'over' | 'dead';

export interface StockBalance {
    warehouse: string;
    qty: number;
}

export type StockSerialStatus = 'in_stock' | 'issued' | 'returned' | 'retired' | 'adjusted';

export interface StockItemSerial {
    id: number;
    serial: string;
    status: StockSerialStatus;
    warehouse: string | null;
    reference: string | null;
    received_at: string | null;
}

export interface StockLot {
    id: number;
    unit_cost: number;
    qty_received: number;
    qty_remaining: number;
    value: number;
    received_at: string | null;
    /** Receive-movement details (null for seeded lots without a movement). */
    doc_no?: string | null;
    reference?: string | null;
    warehouse?: string | null;
    supplier?: string | null;
    recorded_by?: string | null;
    notes?: string | null;
}

export interface StockItem {
    id: number;
    sku: string;
    name: string;
    serial: string | null;
    track_serial: boolean;
    category: string | null;
    category_id: number | null;
    brand: string | null;
    brand_id: number | null;
    model: string | null;
    model_id: number | null;
    unit: string | null;
    unit_id: number | null;
    cost: number;
    current_stock: number;
    min_stock: number;
    max_stock: number;
    warranty: string | null;
    warranty_type_id: number | null;
    last_move_at: string | null;
    days_since_move: number | null;
    status: StockItemStatus;
    total_value: number;
    /** Qty committed by approved-but-unfulfilled requests (list endpoint). */
    reserved?: number;
    /** Per-unit serials — only present on the single-item (show) response. */
    serials?: StockItemSerial[];
    /** FIFO cost lots — only present on the single-item (show) response. */
    lots?: StockLot[];
    /** Per-warehouse balances — only present on the single-item (show) response. */
    balances?: StockBalance[];
}

export type StockMovementType = 'receive' | 'issue' | 'return' | 'transfer' | 'adjust_up' | 'adjust_down';

export interface SerialEvent {
    event: 'received' | 'issued' | 'adjusted' | 'transferred' | 'returned';
    occurred_at: string | null;
    doc_no: string | null;
    reference: string | null;
    recorded_by: string | null;
    from_label: string | null;
    to_label: string | null;
}

export interface StockItemHistory {
    item: { id: number; sku: string; name: string; current_stock: number; track_serial: boolean };
    movements: {
        id: number;
        doc_no: string | null;
        type: StockMovementType;
        qty: number;
        unit_cost: number | null;
        from_label: string | null;
        to_label: string | null;
        reference: string | null;
        recorded_by: string | null;
        notes: string | null;
        moved_at: string | null;
    }[];
    lots: { unit_cost: number; qty_received: number; qty_remaining: number; received_at: string | null; doc_no: string | null; serials: string[] }[];
    serials: { serial: string; status: StockSerialStatus; warehouse: string | null; events: SerialEvent[] }[];
}

export type StockCountStatus = 'draft' | 'committed' | 'canceled';
export type StockCountAdjustMode = 'auto' | 'manual';

export interface StockCountLine {
    id: number;
    stock_item_id: number;
    sku: string | null;
    name: string | null;
    system_qty: number;
    counted_qty: number | null;
    variance: number | null;
    track_serial: boolean;
    serials?: { id: number; serial: string }[];
}

export interface StockCount {
    id: number;
    reference: string;
    warehouse: string | null;
    category: string | null;
    status: StockCountStatus;
    adjust_mode: StockCountAdjustMode | null;
    note: string | null;
    counted_by?: string | null;
    committed_at: string | null;
    created_at: string | null;
    lines?: StockCountLine[];
    line_count?: number;
    counted_lines?: number;
}

export interface StockMovement {
    id: number;
    doc_no: string | null;
    type: StockMovementType;
    stock_item_id: number;
    sku: string | null;
    item_name: string | null;
    qty: number;
    unit_cost: number | null;
    from: string | null;
    to: string | null;
    reference: string | null;
    recorded_by: string | null;
    notes: string | null;
    moved_at: string | null;
}

export type StockRequestStatus = 'pending' | 'approved' | 'fulfilled' | 'rejected';

export interface StockRequest {
    id: number;
    reference: string | null;
    stock_item_id: number;
    sku: string | null;
    item_name: string | null;
    requester_name: string;
    qty: number;
    reason: string;
    status: StockRequestStatus;
    approver_name: string | null;
    approved_at: string | null;
    fulfilled_at: string | null;
    rejected_at: string | null;
    created_at: string | null;
}

export interface StockSummary {
    skus: number;
    total_units: number;
    total_value: number;
    out_count: number;
    low_count: number;
    over_count: number;
    dead_count: number;
    out_items: StockItem[];
    low_items: StockItem[];
    over_items: StockItem[];
    dead_items: StockItem[];
    by_warehouse: { warehouse: string; skus: number; units: number }[];
    by_category: { category: string; skus: number; units: number }[];
    /** Latest movements folded in (view_events only; empty otherwise) so the card lands with the summary. */
    recent_movements: StockMovement[];
}

export interface EmailGroup {
    id: number;
    code: string;
    name: string;
    email: string;
    department_id: number | null;
    department?: string | null;
    description?: string | null;
    owner_employee_id: number | null;
    owner?: string | null;
    owner_photo_url?: string | null;
    members?: AccessMemberPreview[];
    members_count?: number;
}

export interface FileShare {
    id: number;
    code: string;
    name: string;
    path: string;
    department_id: number | null;
    department?: string | null;
    // Numeric size + unit (split for reporting). size 0 = unlimited, null = unspecified.
    size?: number | null;
    size_unit?: string | null;
    description?: string | null;
    owner_employee_id: number | null;
    owner?: string | null;
    owner_photo_url?: string | null;
    members?: AccessMemberPreview[];
    members_count?: number;
}

export interface SocialPlatform {
    id: number;
    code: string;
    name: string;
    url?: string | null;
    color?: string | null;
    policy?: string | null;
    logo_url?: string | null;
    logo_path?: string | null;
    members?: AccessMemberPreview[];
    members_count?: number;
}

export type SoftwareLicenseType = 'perpetual' | 'subscription' | 'free' | 'open_source';

export interface Software {
    id: number;
    code: string;
    name: string;
    publisher?: string | null;
    brand_id?: number | null;
    logo_url?: string | null;
    license_type: SoftwareLicenseType;
    seats?: number | null;
    seats_used?: number;
    /** Whether a product key is on file (visible to everyone). */
    has_product_key?: boolean;
    /** Decrypted product key — only present for users who can manage software. */
    product_key?: string | null;
    notes?: string | null;
    members?: AccessMemberPreview[];
    members_count?: number;
}

/** Lightweight member preview returned inline on the index endpoints. */
export interface AccessMemberPreview {
    id: number;
    employee_id: number;
    name: string | null;
    photo_url?: string | null;
    access_level?: string | null;
    purpose?: string | null;
}

export interface AccessMember {
    id: number;
    employee_id: number;
    employee?: string | null;
    photo_url?: string | null;
    access_level: string | null;
    purpose: string | null;
    granted_at: string | null;
    /** Display name of the admin who granted this membership (audit). */
    granted_by?: string | null;
    revoked_at: string | null;
}

export interface EmployeeAccessRow {
    id: number;
    resource_id: number;
    resource_name: string | null;
    resource_code: string | null;
    resource_detail: string | null;
    resource_color: string | null;
    /** Uploaded logo URL (social platforms + software); null for other resource types. */
    resource_logo: string | null;
    access_level: string | null;
    purpose: string | null;
    granted_at: string | null;
    // True when this employee owns the resource (email-group approver / file-share owner).
    is_owner?: boolean;
}

export interface EmployeeAccess {
    email_groups: EmployeeAccessRow[];
    file_shares: EmployeeAccessRow[];
    social: EmployeeAccessRow[];
    software: EmployeeAccessRow[];
    outstanding: boolean;
}

export type AccessKind = 'email-groups' | 'file-shares' | 'social-platforms' | 'software';

/** Per-channel figures on the Access Directory overview tab. */
export interface AccessChannelStat {
    resources: number;
    grants: number;
    /** Net change in active grants over the last 30 days (positive = grew, negative = shrank). */
    net_30d: number;
}

/** A most-reached resource row (ranked by active-grant count) on the overview tab. */
export interface AccessTopResource {
    id: number;
    name: string;
    /** Type-appropriate detail line: email / path / url, or publisher for software. */
    detail: string | null;
    /** Uploaded logo URL when the resource has one (social / software); null otherwise. */
    logo: string | null;
    kind: AccessKind;
    grants: number;
}

/** Aggregate payload for the Access Directory overview tab (GET /access/dashboard). */
export interface AccessSummary {
    channels: {
        email_groups: AccessChannelStat;
        file_shares: AccessChannelStat;
        social: AccessChannelStat;
        software: AccessChannelStat;
    };
    total_grants: number;
    governance: {
        empty_resources: number;
        empty_sample: string | null;
        no_owner: number;
        owners_complete: boolean;
        resigned_holders: number;
        added_30d: number;
        // Drill-down lists behind each status row. Resigned rows name the person whose grant
        // is still on; ownership rows say why the resource has no custodian — nobody was ever
        // named, or the one who was has left.
        issues: {
            empty: AccessIssueItem[];
            no_owner: (AccessIssueItem & { employee: string | null; reason: 'resigned' | 'none' })[];
            resigned: (AccessIssueItem & { employee: string | null; membership_id: number })[];
        };
    };
    top_resources: AccessTopResource[];
}

/** One problematic resource inside a governance drill-down list. */
export interface AccessIssueItem {
    kind: AccessKind;
    id: number;
    name: string | null;
}

/* ============= Request + Workflow modules ============= */

/** The IT service request types (mirrors App\Enums\Request\RequestType). */
export type ServiceRequestType =
    | 'computer'
    | 'hardware'
    | 'mobile'
    | 'email'
    | 'social'
    | 'fileshare'
    | 'mailgroup'
    | 'software'
    | 'recovery'
    | 'telephone'
    | 'other';

export type ServiceRequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
/**
 * Why a request exists (mirrors App\Enums\Request\RequestOrigin): `direct` is
 * somebody asking for themselves, `onboarding` was filed for a new employee who
 * has no login yet — which is what approvers are shown.
 */
export type ServiceRequestOrigin = 'direct' | 'onboarding';
export type ApprovalRowStatus = 'waiting' | 'current' | 'approved' | 'rejected' | 'skipped';
/**
 * Why the engine skipped a step (mirrors App\Enums\Request\ApprovalSkipReason).
 * Stored as a code and written out through `req_skip_*`, so the trail reads in the
 * viewer's language instead of the language it was submitted in.
 */
export type ApprovalSkipReason = 'no_manager' | 'no_matching_position' | 'no_resource_owner' | 'requester_is_owner';
export type WorkflowActorType = 'chain' | 'owner' | 'it_staff';
export type WorkflowStepKind = 'approval' | 'fulfillment';

/** One frozen step of a request's resolved approval chain. */
export interface RequestApproval {
    id: number;
    position: number;
    actor_type: WorkflowActorType;
    kind: WorkflowStepKind;
    label: string;
    status: ApprovalRowStatus;
    approver_employee_id: number | null;
    approver_name: string | null;
    /** What a person wrote on the step — never a system explanation. */
    note: string | null;
    skip_reason: ApprovalSkipReason | null;
    acted_by_name: string | null;
    became_current_at: string | null;
    acted_at: string | null;
    /** Step is open and its approver has no login account yet — reported live, not snapshotted. */
    awaiting_account: boolean;
}

/** An IT service request as the API returns it. */
export interface ServiceRequest {
    id: number;
    reference: string;
    type: ServiceRequestType;
    /**
     * The canonical English title the server composes from `type` (see
     * RequestService::canonicalTitle) — it is what the case subject, the approval emails
     * and the search index read. Do NOT render it: use requestTitle() from
     * shared/lib/request-meta, which writes the same thing in the reader's language.
     */
    title: string;
    reason: string;
    fields: Record<string, string | number | null>;
    /** Point-in-time labels + resolved values, snapshotted at submit. */
    // value_th is absent on rows snapshotted before it existed, and null where the value
    // has no Thai form to freeze (free text, a share path) — read it through `value`.
    fields_display: { key: string; label_en: string; label_th: string; value: string; value_th?: string | null; mono: boolean }[];
    status: ServiceRequestStatus;
    auto_ticket: boolean;
    /** The last movement on this request: `kind` is a code the SPA writes out, `by` the name frozen on the row that moved. */
    activity: {
        at: string | null;
        kind: 'submitted' | 'approved_step' | 'approved' | 'rejected' | 'cancelled' | 'fulfilled';
        by: string | null;
    };
    /**
     * `name` / `department` are the snapshot taken at submit; `code` / `position` /
     * `photo_url` come off the live employee record and are present on the detail
     * payload only (the list does not load it).
     */
    requester: {
        employee_id: number | null;
        user_id: number | null;
        name: string;
        department: string | null;
        code?: string | null;
        position?: string | null;
        photo_url?: string | null;
    };
    origin: ServiceRequestOrigin;
    /** The account that filed it — set only when that is not the owner (on-behalf). */
    submitted_by: { user_id: number; name: string | null } | null;
    workflow: { id: number | null; name?: string | null };
    ticket?: { id: number; ticket_no: string; status: string | null; assignee: string | null } | null;
    approvals?: RequestApproval[];
    /** Compact chain summary for table rows (WorkflowMini). */
    progress: { total: number; done: number; current_label: string | null };
    can_approve: boolean;
    can_cancel: boolean;
    can_fulfill: boolean;
    approved_at: string | null;
    rejected_at: string | null;
    fulfilled_at: string | null;
    cancelled_at: string | null;
    created_at: string;
}

/** One step of a workflow definition (Workflows admin). */
export interface WorkflowStep {
    id?: number;
    position?: number;
    actor_type: WorkflowActorType;
    label: string;
    kind: WorkflowStepKind;
    /**
     * The job titles allowed to sign this rung. Resolution climbs the requester's
     * reporting line until it finds a holder, so a Staff member's Supervisor rung
     * reaches an actual Supervisor rather than whoever sits one level up. Empty on
     * owner / it_staff steps, which resolve by other means.
     */
    positions: { id: number; title: string }[];
}

/**
 * How long a route actually took lately — measured from the requests that ran
 * through it (submitted → decided), never a configured target. Null when nothing
 * on that route was decided inside the window the API reports in `meta`.
 */
export interface WorkflowMeasured {
    avg_days: number;
    requests: number;
}

/** An approval workflow definition — one per request type. */
export interface Workflow {
    id: number;
    request_type: ServiceRequestType;
    name: string;
    active: boolean;
    auto_ticket: boolean;
    steps: WorkflowStep[];
    measured: WorkflowMeasured | null;
    updated_at: string | null;
}

/** One dynamic field definition of the New Request dialog (from RequestSchemas). */
export interface RequestFieldSchema {
    key: string;
    label_en: string;
    label_th: string;
    input: 'text' | 'textarea' | 'email' | 'number' | 'date' | 'select' | 'source';
    options?: { value: string; label_en: string; label_th: string }[];
    /** The choices are rows of request_options, editable in Settings → Request data. */
    managed?: boolean;
    source?: 'email_groups' | 'file_shares' | 'social_platforms' | 'softwares' | 'locations';
    required?: boolean;
    mono?: boolean;
    placeholder?: string;
    default?: string | number;
    min?: number;
    max?: number;
    /** On a `source` field: the sibling key holding a typed-in value when the item isn't listed. */
    allow_other?: string;
    /** Not rendered on its own — revealed by its `allow_other` partner. */
    internal?: boolean;
}

/** One selectable row of a source-backed field (file share, mail group, …). */
export interface RequestSourceOption {
    id: number;
    label: string;
    detail: string | null;
}

/** One editable choice of a managed request-form list (Settings → Request data). */
export interface RequestOption {
    id: number;
    request_type: ServiceRequestType;
    field_key: string;
    label_en: string;
    label_th: string | null;
    sort_order: number;
    active: boolean;
}

/** A managed list: which request type and field its choices feed. */
export interface RequestOptionList {
    request_type: ServiceRequestType;
    field_key: string;
    label_en: string;
    label_th: string;
}
