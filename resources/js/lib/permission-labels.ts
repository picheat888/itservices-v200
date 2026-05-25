import type { Lang } from '@/types';

type L = { en: string; th: string };

const MODULES: Record<string, L> = {
    tickets: { en: 'Tickets', th: 'Ticket' },
    requests: { en: 'Requests', th: 'คำขอ' },
    assets: { en: 'Assets', th: 'ทรัพย์สิน' },
    contracts: { en: 'Contracts', th: 'สัญญา' },
    employees: { en: 'Employees', th: 'พนักงาน' },
    system: { en: 'System', th: 'ระบบ' },
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
    'contracts.renew': { en: 'Renew contracts', th: 'ต่ออายุสัญญา' },
    'contracts.alerts': { en: 'Receive expiry alerts', th: 'รับการแจ้งเตือนหมดอายุ' },
    'employees.view': { en: 'View directory', th: 'ดูรายชื่อพนักงาน' },
    'employees.add': { en: 'Add employee', th: 'เพิ่มพนักงาน' },
    'employees.edit': { en: 'Edit employee', th: 'แก้ไขข้อมูลพนักงาน' },
    'employees.edit_own': { en: 'Edit own profile', th: 'แก้ไขโปรไฟล์ของตนเอง' },
    'employees.reset_password': { en: 'Reset password', th: 'รีเซ็ตรหัสผ่าน' },
    'employees.resign': { en: 'Record resignation', th: 'บันทึกการลาออก' },
    'employees.cancel_resign': { en: 'Cancel resignation', th: 'ยกเลิกการลาออก' },
    'employees.set_credentials': { en: 'Set username & password', th: 'ตั้งชื่อผู้ใช้และรหัสผ่าน' },
    'system.manage_roles': { en: 'Manage roles', th: 'จัดการบทบาท' },
    'system.manage_groups': { en: 'Manage groups', th: 'จัดการกลุ่มผู้ใช้' },
    'system.edit_settings': { en: 'Edit settings', th: 'แก้ไขการตั้งค่าระบบ' },
    'system.configure_notifications': { en: 'Configure notifications', th: 'ตั้งค่าการแจ้งเตือน' },
    'system.view_audit': { en: 'View audit log', th: 'ดูบันทึกการตรวจสอบ' },
};

export const moduleLabel = (key: string, lang: Lang) => MODULES[key]?.[lang] ?? key;
export const actionLabel = (module: string, action: string, lang: Lang) => ACTIONS[`${module}.${action}`]?.[lang] ?? action;

// Permission keys whose enforcement is actually live today. Everything else is
// shown with a "(Coming soon)" tag in the matrix (toggle still persists).
const LIVE = new Set<string>([
    'employees.view',
    'employees.add',
    'employees.edit',
    'employees.edit_own',
    'employees.reset_password',
    'employees.resign',
    'employees.cancel_resign',
    'employees.set_credentials',
    'system.manage_roles',
    'system.manage_groups',
    'system.edit_settings',
    'system.view_audit',
]);

export const isLivePermission = (key: string) => LIVE.has(key);
