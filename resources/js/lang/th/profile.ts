import type { Dict } from '@/lang/types';

/**
 * My Profile drawer: details, assets, tickets, requests, access, sign-ins tabs
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
    profile_tab_devices: 'การเข้าสู่ระบบ',
    // my-assets-tab.tsx — แท็บทรัพย์สิน
    my_assets_new: 'ใหม่',
    my_assets_return_confirm: 'ส่งทรัพย์สินนี้คืน IT? จะขึ้นสถานะรอรับคืนจนกว่า IT จะกดรับคืน',
    profile_assets_pending_caption: 'รอคุณรับมอบ',
    profile_assets_held_heading: 'ทรัพย์สินของฉัน',
    profile_assets_col_handed_over: 'ส่งมอบเมื่อ',
    profile_pending_assets_badge: '{n} รายการรอรับมอบ',
    profile_assets_show_all: 'แสดงทั้งหมด อีก {n} รายการ',
    profile_assets_show_less: 'แสดงน้อยลง',
    profile_assets_accept_all: 'รับมอบทั้งหมด',
    profile_assets_accept_all_confirm: 'ยืนยันว่าได้รับทรัพย์สินทั้ง {n} รายการนี้ครบแล้ว',
    profile_assets_accepted: 'รับมอบแล้ว',
    // my-devices-tab.tsx — แท็บการเข้าสู่ระบบ
    profile_devices_heading: 'เครื่องที่เข้าสู่ระบบอยู่',
    profile_devices_limit_note: 'ใช้พร้อมกันได้ไม่เกิน {n} เครื่อง',
    profile_device_current: 'เครื่องนี้',
    profile_device_remembered: 'จดจำไว้ถึง {date}',
    profile_device_signed_in: 'เข้าสู่ระบบ {time}',
    profile_device_end_title: 'ออกจากระบบเครื่องที่เลือก',
    profile_device_end_desc: 'เครื่องที่เลือกจะออกจากระบบทันที ต้องเข้าสู่ระบบใหม่เมื่อจะใช้งานต่อ',
    profile_device_ended: 'ออกจากระบบ {device} แล้ว',
    profile_logins_heading: 'ประวัติการเข้าสู่ระบบล่าสุด',
    profile_logins_col_time: 'เวลา',
    profile_logins_col_event: 'เหตุการณ์',
    profile_logins_col_device: 'เครื่อง',
    profile_logins_col_place: 'ที่ตั้ง',
    profile_logins_hint: 'แสดง 10 ครั้งล่าสุดของบัญชีนี้ ถ้าเห็นการเข้าที่ไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านและแจ้ง IT',

    // empty states — การ์ดและตารางที่ไม่มีข้อมูล
    profile_empty_assets_held: 'คุณยังไม่ได้ถือครองทรัพย์สิน',
    profile_empty_assets_held_hint: 'ทรัพย์สินที่ส่งมอบให้คุณจะแสดงที่นี่',
    profile_empty_tickets: 'คุณยังไม่เคยแจ้ง Ticket',
    profile_empty_tickets_hint: 'แจ้งปัญหา IT ได้จากปุ่ม{button}',
    profile_empty_requests: 'คุณยังไม่เคยยื่นคำขอ',
    profile_empty_requests_hint: 'ยื่นคำขอได้ที่หน้าคำขอ',
    profile_empty_access: 'ยังไม่มีสิทธิ์เข้าถึงที่บันทึกไว้ให้คุณ',
    profile_empty_access_hint: 'ขอสิทธิ์ได้จากหน้าคำขอ',
    profile_empty_devices: 'ไม่มีเครื่องที่เข้าสู่ระบบอยู่',
    profile_empty_logins: 'ยังไม่มีประวัติการเข้าสู่ระบบ',
};
