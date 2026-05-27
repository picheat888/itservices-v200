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
export type LoginMethod = 'email' | 'userpass';

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
    login_method: LoginMethod;
    username: string | null;
    joined_at: string | null;
    status: EmployeeStatus;
    resign_reason: string | null;
    last_day: string | null;
    has_account: boolean;
    is_super_admin: boolean;
}

export type ContractType = 'software' | 'hardware' | 'service' | 'connectivity' | 'other';
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
export type ContractStatus = 'active' | 'expired' | 'cancelled';

export interface Contract {
    id: number;
    code: string;
    vendor: string;
    name: string;
    type: ContractType;
    start: string;
    end: string;
    value: number;
    value_display: string;
    billing_cycle: BillingCycle;
    auto_renew: boolean;
    owner_id: number | null;
    owner: string | null;
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
    linked_assets: never[];
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
