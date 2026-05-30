import { LucideIcon } from 'lucide-react';

export type Role = 'super' | 'admin' | 'hr' | 'user';

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
    photo_url: string | null;
    phone: string | null;
    name_th: string | null;
    permissions: string[];
    preferences: UserPreferences;
    email_verified_at: string | null;
    password_expired: boolean;
}

export interface ApiEnvelope<T> {
    data: T;
    message: string;
}

export type EmployeeStatus = 'active' | 'resigned';

export interface Department {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    head: string | null;
    location: string | null;
    count?: number;
}

export interface Position {
    id: number;
    code: string;
    title: string;
}

export interface LocationItem {
    id: number;
    name: string;
}

export interface Employee {
    id: number;
    code: string;
    name: string;
    name_th: string | null;
    photo_url: string | null;
    department_id: number | null;
    position_id: number | null;
    department: string | null;
    department_th: string | null;
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
export type ContractStatus = 'active' | 'expired' | 'cancelled';

export interface ContractAttachment {
    id: number;
    name: string;
    size: number;
    url: string;
    created_at: string | null;
}

export interface ContractLinkedAsset {
    id: number;
    tag: string;
    name: string;
    status: string | null;
    owner: string | null;
}

export interface Contract {
    id: number;
    code: string;
    vendor: string;
    title: string | null;
    name: string;
    type: ContractType;
    start: string;
    end: string;
    value: number;
    value_display: string;
    billing_cycle: BillingCycle;
    auto_renew: boolean;
    status: ContractStatus;
    days_remaining: number;
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
    created_at: string | null;
    updated_at: string | null;
}

export interface ContractSummary {
    total: number;
    active: number;
    expiring: number;
    expired: number;
    cancelled: number;
    annual_value: string;
    top_vendors: { vendor: string; amount: number }[];
    timeline: { id: number; code: string; name: string; vendor: string; end: string; days: number }[];
    action_queue: { id: number; code: string; name: string; vendor: string; days: number }[];
}

// Assets Management module
export type AssetType = 'laptop' | 'desktop' | 'mobile' | 'printer' | 'server' | 'network' | 'other';
export type AssetSource = 'purchased' | 'rented';
export type AssetStatus = 'ready' | 'pending_acceptance' | 'deployed' | 'pending_return' | 'maintenance' | 'writeoff' | 'pending_stock';

export interface Asset {
    id: number;
    tag: string;
    type: AssetType;
    brand: string | null;
    model: string;
    serial: string | null;
    source: AssetSource;
    status: AssetStatus;
    owner: string | null;
    initial_owner: string | null;
    department: string | null;
    location: string | null;
    value: number;
    value_display: string;
    supplier: string | null;
    purchase_date: string | null;
    warranty_end: string | null;
    contract_id: number | null;
    contract_code?: string | null;
    lease_start: string | null;
    lease_end: string | null;
    cover_end: string | null;
    registered_date: string | null;
    notes: string | null;
    last_reason: string | null;
    created_at: string | null;
    updated_at: string | null;
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
    maintenance: number;
    writeoff: number;
    total_value: number;
    by_type: { type: AssetType; count: number }[];
    top_value: Asset[];
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

export interface Ticket {
    id: number;
    ticket_no: string;
    subject: string;
    subject_th: string | null;
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
    related_asset_model?: string | null;
    take_note: string | null;
    resolution: string | null;
    resolved_at: string | null;
    attachments?: TicketAttachment[];
    created_at: string | null;
    updated_at: string | null;
}

export interface TicketSummary {
    total: number;
    open: number;
    in_progress: number;
    completed: number;
    canceled: number;
    by_category: { category: TicketCategory; count: number }[];
    avg_response_minutes: number | null;
    sla_met_pct: number | null;
}

export interface NavItem {
    id: string;
    label: string;
    to: string;
    icon: LucideIcon;
    count?: number;
    roles?: Role[];
    permission?: string;
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
    description?: string | null;
    track_serial?: boolean;
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

export interface StockStatus {
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

export type StockSerialStatus = 'in_stock' | 'issued' | 'returned' | 'retired';

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
}

export interface StockItem {
    id: number;
    sku: string;
    name: string;
    serial: string | null;
    track_serial: boolean;
    category: string | null;
    brand: string | null;
    model: string | null;
    unit: string;
    cost: number;
    current_stock: number;
    min_stock: number;
    max_stock: number;
    warehouse: string | null;
    supplier: string | null;
    warranty: string | null;
    last_move_at: string | null;
    days_since_move: number | null;
    status: StockItemStatus;
    total_value: number;
    /** Per-unit serials — only present on the single-item (show) response. */
    serials?: StockItemSerial[];
    /** FIFO cost lots — only present on the single-item (show) response. */
    lots?: StockLot[];
}

export type StockMovementType = 'receive' | 'issue' | 'return' | 'transfer' | 'adjust_up' | 'adjust_down';

export type StockCountStatus = 'draft' | 'committed' | 'canceled';

export interface StockCountLine {
    id: number;
    stock_item_id: number;
    sku: string | null;
    name: string | null;
    system_qty: number;
    counted_qty: number | null;
    variance: number | null;
}

export interface StockCount {
    id: number;
    reference: string;
    warehouse: string | null;
    category: string | null;
    status: StockCountStatus;
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
    by_warehouse: { warehouse: string; skus: number; units: number; value: number }[];
    by_category: { category: string; skus: number; units: number }[];
}
