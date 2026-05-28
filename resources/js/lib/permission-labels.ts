import type { Lang } from '@/types';

type L = { en: string; th: string };

const MODULES: Record<string, L> = {
    tickets: { en: 'Tickets', th: 'Ticket' },
    requests: { en: 'Requests', th: 'คำขอ' },
    assets: { en: 'Assets', th: 'ทรัพย์สิน' },
    contracts: { en: 'Contracts', th: 'สัญญา' },
    stock: { en: 'Stock', th: 'คลังพัสดุ' },
    employees: { en: 'Employees', th: 'พนักงาน' },
    system: { en: 'System', th: 'ระบบ' },
    // Administration sub-groups (design split). Permission/Email/Setting reuse the
    // live system.* keys; the rest are presentational "coming soon" placeholders.
    permissions: { en: 'Permission', th: 'สิทธิ์การใช้งาน' },
    email_templates: { en: 'Email Templates', th: 'เทมเพลตอีเมล' },
    settings: { en: 'Setting', th: 'ตั้งค่า' },
    reports: { en: 'Reports', th: 'รายงาน' },
};

const ACTIONS: Record<string, L> = {
    'tickets.view_all': { en: 'View all tickets', th: 'ดูตั๋วทั้งหมด' },
    'tickets.create': { en: 'Create tickets', th: 'สร้างตั๋ว' },
    'tickets.assign': { en: 'Assign tickets', th: 'รับมอบหมายตั๋ว' },
    'tickets.resolve': { en: 'Resolve & close', th: 'แก้ไขและปิดเคส' },
    'tickets.delete': { en: 'Delete tickets', th: 'ลบตั๋ว' },
    'requests.submit': { en: 'Submit requests', th: 'ส่งคำขอ' },
    'requests.approve_manager': { en: 'Approve as manager', th: 'อนุมัติในฐานะหัวหน้า' },
    'requests.approve_it': { en: 'Approve as IT', th: 'อนุมัติในฐานะไอที' },
    'requests.view_all': { en: 'View all requests', th: 'ดูคำขอทั้งหมด' },
    'requests.reject': { en: 'Reject requests', th: 'ปฏิเสธคำขอ' },
    'assets.view': { en: 'View inventory', th: 'ดูคลังทรัพย์สิน' },
    'assets.register': { en: 'Register assets', th: 'ลงทะเบียนทรัพย์สิน' },
    'assets.transfer': { en: 'Transfer assets', th: 'โอนทรัพย์สิน' },
    'assets.retire': { en: 'Retire assets', th: 'เลิกใช้ทรัพย์สิน' },
    'assets.edit': { en: 'Edit asset metadata', th: 'แก้ไขข้อมูลทรัพย์สิน' },
    'contracts.view': { en: 'View contracts', th: 'ดูสัญญา' },
    'contracts.create': { en: 'Create contracts', th: 'สร้างสัญญา' },
    'contracts.edit': { en: 'Edit contracts', th: 'แก้ไขสัญญา' },
    'contracts.import': { en: 'Import contracts (CSV)', th: 'นำเข้าข้อมูลสัญญา (CSV)' },
    'contracts.renew': { en: 'Renew contracts', th: 'ต่ออายุสัญญา' },
    'contracts.alerts': { en: 'Contract Expiry Notification', th: 'การแจ้งเตือนสัญญาหมดอายุ' },
    'stock.view': { en: 'View stock', th: 'ดูคลังพัสดุ' },
    'stock.request': { en: 'Submit stock request', th: 'ขอเบิกพัสดุ' },
    'stock.approve': { en: 'Approve stock requests', th: 'อนุมัติคำขอเบิก' },
    'stock.fulfill': { en: 'Issue / fulfill', th: 'จ่ายของ' },
    'stock.receive': { en: 'Receive into stock', th: 'รับเข้าคลัง' },
    'stock.transfer': { en: 'Transfer between warehouses', th: 'ย้ายระหว่างคลัง' },
    'stock.return': { en: 'Process returns', th: 'รับคืนพัสดุ' },
    'stock.manage_items': { en: 'Manage SKU (Min/Max)', th: 'จัดการรายการสินค้า (SKU, Min/Max)' },
    'stock.manage_warehouse': { en: 'Manage warehouses (master data)', th: 'จัดการคลัง (ข้อมูลหลัก)' },
    'stock.audit': { en: 'Stock count / audit', th: 'นับสต็อก / ตรวจสอบ' },
    'stock.delete': { en: 'Write-off stock', th: 'ตัดจำหน่ายพัสดุ' },
    'employees.view': { en: 'View directory', th: 'ดูรายชื่อพนักงาน' },
    'employees.add': { en: 'Add employee', th: 'เพิ่มพนักงาน' },
    'employees.import': { en: 'Import employees (CSV)', th: 'นำเข้าข้อมูลพนักงาน (CSV)' },
    'employees.edit': { en: 'Edit employee', th: 'แก้ไขข้อมูลพนักงาน' },
    'employees.edit_own': { en: 'Edit own profile', th: 'แก้ไขโปรไฟล์ของตนเอง' },
    'employees.reset_password': { en: 'Reset password', th: 'รีเซ็ตรหัสผ่าน' },
    'employees.resign': { en: 'Record resignation', th: 'บันทึกการลาออก' },
    'employees.cancel_resign': { en: 'Cancel resignation', th: 'ยกเลิกการลาออก' },
    'employees.set_credentials': { en: 'Set username & password', th: 'ตั้งชื่อผู้ใช้และรหัสผ่าน' },
    'system.manage_permissions': { en: 'Manage permissions', th: 'จัดการสิทธิ์การใช้งาน' },
    'system.manage_roles': { en: 'Manage roles', th: 'จัดการบทบาท' },
    'system.manage_groups': { en: 'Manage groups', th: 'จัดการกลุ่มผู้ใช้' },
    'system.edit_settings': { en: 'Edit settings', th: 'แก้ไขการตั้งค่าระบบ' },
    'system.configure_notifications': { en: 'Configure notifications', th: 'ตั้งค่าการแจ้งเตือน' },
    'system.view_audit': { en: 'View audit log', th: 'ดูบันทึกการตรวจสอบ' },
    // Reports module — not built yet (all coming soon).
    'reports.view': { en: 'View reports', th: 'ดูรายงาน' },
    'reports.run': { en: 'Run reports', th: 'เรียกใช้รายงาน' },
    'reports.export': { en: 'Export data (CSV / XLSX)', th: 'ส่งออกข้อมูล (CSV / XLSX)' },
    'reports.schedule': { en: 'Schedule automated runs', th: 'ตั้งกำหนดการอัตโนมัติ' },
    'reports.custom': { en: 'Create custom report', th: 'สร้างรายงานแบบกำหนดเอง' },
    // Email Templates — granular enforcement coming soon (configure_notifications is live).
    'email.edit': { en: 'Edit template content', th: 'แก้ไขเนื้อหาเทมเพลต' },
    'email.enable': { en: 'Enable / disable templates', th: 'เปิด / ปิดเทมเพลต' },
    'email.create': { en: 'Create new template', th: 'สร้างเทมเพลตใหม่' },
    'email.test': { en: 'Send test email', th: 'ส่งอีเมลทดสอบ' },
    // Settings — granular enforcement coming soon (edit_settings is live).
    'settings.branding': { en: 'Branding & theme', th: 'ปรับแบรนด์ / ธีม' },
    'settings.sla': { en: 'SLA & statuses', th: 'แก้ไข SLA และสถานะ' },
    'settings.masterdata': { en: 'Manage Master Data', th: 'จัดการ Master Data' },
    'settings.integrations': { en: 'External integrations', th: 'การเชื่อมต่อระบบภายนอก' },
};

export const moduleLabel = (key: string, lang: Lang) => MODULES[key]?.[lang] ?? key;
export const actionLabel = (module: string, action: string, lang: Lang) => ACTIONS[`${module}.${action}`]?.[lang] ?? action;

// Permission keys whose enforcement is actually live today. Everything else is
// shown with a "(Coming soon)" tag in the matrix (toggle still persists).
const LIVE = new Set<string>([
    'contracts.view',
    'contracts.create',
    'contracts.edit',
    'contracts.import',
    'contracts.renew',
    'contracts.alerts',
    'stock.view',
    'stock.request',
    'stock.approve',
    'stock.fulfill',
    'stock.receive',
    'stock.transfer',
    'stock.return',
    'stock.manage_items',
    'stock.delete',
    'employees.view',
    'employees.add',
    'employees.import',
    'employees.edit',
    'employees.edit_own',
    'employees.reset_password',
    'employees.resign',
    'employees.cancel_resign',
    'employees.set_credentials',
    'system.manage_permissions',
    'system.manage_roles',
    'system.manage_groups',
    'system.edit_settings',
    'system.view_audit',
]);

export const isLivePermission = (key: string) => LIVE.has(key);
