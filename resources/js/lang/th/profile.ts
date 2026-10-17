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
    profile_no_access: 'ยังไม่มีสิทธิ์เข้าถึงที่บันทึกไว้ให้คุณ',
    profile_no_requests: 'คุณยังไม่เคยยื่นคำขอ',
    // my-assets-tab.tsx — แท็บทรัพย์สิน
    my_assets_new: 'ใหม่',
    my_assets_return_confirm: 'ส่งทรัพย์สินนี้คืน IT? จะขึ้นสถานะรอรับคืนจนกว่า IT จะกดรับคืน',
    my_assets_empty: 'คุณยังไม่มีทรัพย์สินที่ถือครอง',
    profile_assets_pending_caption: 'รอคุณรับมอบ',
    profile_assets_held_heading: 'ทรัพย์สินของฉัน',
    profile_assets_col_handed_over: 'ส่งมอบเมื่อ',
    profile_pending_assets_badge: '{n} รายการรอรับมอบ',
    profile_assets_show_all: 'แสดงทั้งหมด อีก {n} รายการ',
    profile_assets_show_less: 'แสดงน้อยลง',
    profile_assets_accept_all: 'รับมอบทั้งหมด',
    profile_assets_accept_all_confirm: 'ยืนยันว่าได้รับทรัพย์สินทั้ง {n} รายการนี้ครบแล้ว',
    profile_assets_accepted: 'รับมอบแล้ว',

    // empty states — การ์ดและตารางที่ไม่มีข้อมูล
    profile_empty_assets_held: 'คุณยังไม่ได้ถือครองทรัพย์สิน',
    profile_empty_assets_held_hint: 'ทรัพย์สินที่ส่งมอบให้คุณจะแสดงที่นี่',
    profile_empty_tickets: 'คุณยังไม่เคยแจ้ง Ticket',
    profile_empty_tickets_hint: 'แจ้งปัญหา IT ได้จากปุ่มเปิด Ticket',
    profile_empty_requests: 'คุณยังไม่เคยยื่นคำขอ',
    profile_empty_requests_hint: 'ยื่นคำขอได้ที่หน้าคำขอ',
    profile_empty_access: 'ยังไม่มีสิทธิ์เข้าถึงที่บันทึกไว้ให้คุณ',
    profile_empty_access_hint: 'ขอสิทธิ์ได้จากหน้าคำขอ',
};
