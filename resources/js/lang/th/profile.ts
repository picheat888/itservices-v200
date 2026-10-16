import type { Dict } from '@/lang/types';

/**
 * My Profile drawer: details, assets, tickets, requests, access tabs
 */
export const profile: Dict = {
    // profile-drawer.tsx — cover, rail, footer
    profile_name: 'ชื่อ',
    profile_change_photo: 'เปลี่ยนรูป',
    profile_name_required: 'กรุณากรอกชื่อ',
    profile_last_name_required: 'กรุณากรอกนามสกุล',
    profile_save_failed: 'บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่',
    profile_details: 'ข้อมูลพนักงาน',
    profile_account: 'บัญชีเข้าใช้งาน',
    profile_contact: 'ข้อมูลติดต่อ',
    profile_tab_details: 'ข้อมูลส่วนตัว',
    profile_no_tickets: 'คุณยังไม่เคยแจ้ง Ticket',
    profile_no_access: 'คุณยังไม่มีสิทธิ์เข้าถึง',
    profile_no_requests: 'คุณยังไม่เคยยื่นคำขอ',
    // my-assets-tab.tsx — แท็บทรัพย์สิน
    my_assets_new: 'ใหม่',
    my_assets_return_confirm: 'ส่งทรัพย์สินนี้คืน IT? จะขึ้นสถานะรอรับคืนจนกว่า IT จะยืนยันรับ',
    my_assets_empty: 'คุณยังไม่มีทรัพย์สินที่ถือครอง',
    profile_assets_pending_caption: 'รอให้คุณกดรับ',
    profile_assets_held_heading: 'ทรัพย์สินของฉัน',
    profile_assets_col_handed_over: 'มอบหมายเมื่อ',
    profile_pending_assets_badge: '{n} รายการรอรับ',
    profile_assets_show_all: 'แสดงทั้งหมด อีก {n} รายการ',
    profile_assets_show_less: 'แสดงน้อยลง',
    profile_assets_accept_all: 'รับมอบทั้งหมด',
    profile_assets_accept_all_confirm: 'ยืนยันว่าได้รับทรัพย์สินทั้ง {n} รายการนี้ครบแล้ว',
    profile_assets_accepted: 'รับมอบแล้ว',
};
