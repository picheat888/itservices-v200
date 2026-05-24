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
    permissions: string[];
    preferences: UserPreferences;
    email_verified_at: string | null;
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
