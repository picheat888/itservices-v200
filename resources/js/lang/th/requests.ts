import type { Dict } from '@/lang/types';

/**
 * โมดูลคำขอบริการ IT — ข้อความภาษาไทย (คีย์ล้อกับ en/requests.ts ทุกตัว)
 */
export const requests: Dict = {
    // ประเภทบริการ
    req_computer: 'คอมพิวเตอร์',
    req_hardware: 'ฮาร์ดแวร์ / อุปกรณ์ต่อพ่วง',
    req_mobile: 'อุปกรณ์มือถือ',
    req_email: 'บัญชีอีเมล',
    req_social: 'ขอใช้โซเชียลมีเดีย',
    req_fileshare: 'ขอเข้าถึงไฟล์แชร์',
    req_mailgroup: 'กลุ่มเมล',
    req_software: 'ติดตั้งซอฟต์แวร์',
    req_recovery: 'กู้คืนข้อมูล',
    req_telephone: 'โทรศัพท์',
    req_other: 'คำขออื่น ๆ',

    // หัวหน้า
    requests_title: 'คำขอบริการ',
    requests_sub: 'ยื่นคำขอบริการ IT และติดตามทุกขั้นการอนุมัติ',
    requests_new: 'คำขอใหม่',
    requests_tab_dashboard: 'ภาพรวม',
    requests_tab_all: 'คำขอทั้งหมด',
    requests_tab_approvals: 'รออนุมัติจากฉัน',

    // การ์ด KPI
    req_kpi_awaiting: 'รออนุมัติจากคุณ',
    req_kpi_awaiting_of: 'จากที่รออนุมัติทั้งหมด',
    req_kpi_approved: 'อนุมัติแล้ว',
    req_kpi_rejected: 'ไม่อนุมัติ',
    req_kpi_cycle: 'เวลาตัดสินเฉลี่ย',
    req_kpi_cycle_sub: 'ตั้งแต่ยื่นจนตัดสินครบ',
    req_kpi_days_suffix: ' วัน',

    // แท็บภาพรวม
    req_queue_title: 'รอการตัดสินจากคุณ',
    req_queue_empty: 'ไม่มีคำขอค้างอนุมัติ',
    req_queue_empty_sub: 'ทุกคำขอที่ต้องผ่านคุณ ได้รับการตัดสินแล้ว',
    req_recent_empty: 'ยังไม่มีคำขอ — เริ่มได้จากปุ่ม “คำขอใหม่”',
    req_view_all: 'ดูทั้งหมด',
    req_catalog_approval_one: 'ขั้นอนุมัติ',
    req_catalog_approval_many: 'ขั้นอนุมัติ',
    req_recent_title: 'ความเคลื่อนไหวล่าสุด',
    req_inactive: 'ปิดรับคำขอชั่วคราว',

    // ตาราง
    req_col_title: 'หัวข้อ',
    req_col_requester: 'ผู้ขอ',
    req_col_workflow: 'สายอนุมัติ',
    req_col_status: 'สถานะ',
    req_search_ph: 'ค้นหาคำขอ…',
    req_filter_status: 'สถานะ',
    req_filter_type: 'บริการ',
    req_age_today: 'วันนี้',
    req_age_days: ' วัน',

    // สถานะ
    req_status_pending: 'รออนุมัติ',
    req_status_approved: 'อนุมัติแล้ว',
    req_status_rejected: 'ไม่อนุมัติ',
    req_status_fulfilled: 'ดำเนินการแล้ว',
    req_status_cancelled: 'ยกเลิก',

    // ปุ่ม
    req_approve: 'อนุมัติ',
    req_reject: 'ไม่อนุมัติ',
    req_fulfill: 'ปิดงานแล้ว',
    req_cancel_request: 'ยกเลิกคำขอ',

    // สร้างคำขอ (wizard)
    req_new_eyebrow: 'คำขอใหม่',
    req_select_placeholder: 'เลือก…',
    req_bad_email: 'รูปแบบอีเมลไม่ถูกต้อง',
    req_new_title: 'เปิดคำขอบริการ IT',
    req_step_service: 'เลือกบริการ',
    req_step_details: 'กรอกรายละเอียด',
    req_step_review: 'ตรวจสอบและส่ง',
    req_pick_title: 'ต้องการขอบริการอะไร?',
    req_pick_sub: 'การขอแต่ละบริการใช้ข้อมูลไม่เหมือนกัน',
    req_route_title: 'การอนุมัติ',
    req_details_title: 'รายละเอียดคำขอ',
    req_details_sub: 'หัวข้อและเหตุผลที่ชัดเจน ช่วยให้ผู้อนุมัติตัดสินใจได้เร็วขึ้น',
    req_section_general: 'เรื่องที่ขอ',
    /** หัวข้อที่ระบบตั้งให้ — {service} คือชื่อบริการ */
    req_auto_title: 'คำขอ: {service}',
    req_field_reason: 'เหตุผล / รายละเอียด',
    req_field_reason_ph: 'อธิบายความจำเป็น เพื่อให้ผู้อนุมัติตัดสินใจได้เร็วขึ้น',
    req_requester_label: 'ผู้ขอ',
    req_service_section: 'ข้อมูลเฉพาะของบริการ',
    req_other_software: 'ไม่มีในรายการ — กรอกชื่อเอง',
    req_review_title: 'ตรวจสอบและส่ง',
    req_review_sub: 'ตรวจอีกครั้ง — เมื่อส่งแล้วคำขอจะถูกส่งถึงผู้อนุมัติขั้นแรกทันที',
    req_auto_ticket_note: 'เมื่ออนุมัติครบ ระบบจะเปิด Ticket ให้ทีม IT อัตโนมัติ',
    req_submit: 'ส่งคำขอ',
    req_submitted: 'ส่งคำขอแล้ว',
    req_awaiting_first: 'รออนุมัติขั้นที่ 1',
    req_no_employee_hint: 'บัญชีของคุณยังไม่ผูกกับข้อมูลพนักงาน ติดต่อ IT เพื่อผูกบัญชีก่อนยื่นคำขอ',

    // หน้าต่างรายละเอียด
    req_detail_eyebrow: 'คำขอบริการ',
    req_reason_label: 'เหตุผล',
    req_requester: 'ผู้ขอ',
    req_department: 'แผนก',
    req_created: 'ยื่นเมื่อ',
    // ป้ายบอกว่าเป็นคำขอที่ยื่นแทน (พนักงานใหม่) — โผล่ทุกที่ที่ผู้อนุมัติเห็นคำขอ
    req_origin_onboarding: 'พนักงานใหม่',
    req_submitted_by: 'ยื่นแทนโดย',
    req_await_account: 'รอ - ผู้อนุมัติรายนี้ยังไม่มีบัญชีผู้ใช้งาน',
    // แถบเหตุผลของขั้นที่ถูกข้าม — พูดให้ครบในตัวเอง ("ข้ามขั้นนี้ เนื่องจาก...")
    // เพราะบรรทัดสถานะด้านบนไม่พูดคำว่า "ข้ามขั้นนี้" ซ้ำอีก
    req_skip_no_manager: 'ข้ามขั้นนี้ เนื่องจากผู้ขอยังไม่ได้ตั้งผู้บังคับบัญชา',
    req_skip_requester_outranks_step: 'ข้ามขั้นนี้ เนื่องจากผู้ขอถือตำแหน่งระดับนี้หรือสูงกว่าอยู่แล้ว',
    req_skip_no_matching_position: 'ข้ามขั้นนี้ เนื่องจากในสายอนุมัติไม่มีผู้ถือตำแหน่งระดับนี้',
    req_skip_no_resource_owner: 'ข้ามขั้นนี้ เนื่องจากรายการนี้ไม่มีเจ้าของที่อนุมัติได้',
    req_skip_requester_is_owner: 'ข้ามขั้นนี้ เนื่องจากผู้ขอเป็นเจ้าของรายการนี้เอง',
    req_onboarding_title: 'คำขอสำหรับพนักงานใหม่',
    req_onboarding_desc: 'ยื่นพร้อมกับการเพิ่มข้อมูลพนักงาน ตอนที่เจ้าตัวยังไม่มีบัญชีเข้าใช้งาน',
    req_trail_title: 'เส้นทางการอนุมัติ',
    req_trail_submitted: 'ยื่นคำขอ',
    req_trail_fulfillment: 'Admin / ทีม IT ดำเนินการ',
    req_trail_approved: 'อนุมัติแล้ว',
    req_trail_rejected: 'ไม่อนุมัติ',
    req_trail_waiting: 'รออนุมัติ · แจ้งแล้วทาง Bell + Email',
    req_trail_queued: 'ยังไม่ถึงคิว',
    req_trail_skipped: 'ข้ามขั้นนี้',
    req_trail_after_approvals: 'รออนุมัติครบทุกขั้น',
    req_trail_fulfilled_done: 'เสร็จสิ้น · แจ้งผู้ขอแล้ว',
    req_trail_ticket_opened: 'เปิด Ticket อัตโนมัติแล้ว',
    req_linked_ticket: 'Ticket ที่เชื่อมโยง',
    req_no_ticket: 'ไม่มี Ticket — สายนี้ปิดงานโดยไม่เปิดเคส',
    req_ticket_auto_hint: 'เปิดอัตโนมัติเมื่ออนุมัติครบ — มอบหมายให้ทีม IT',

    // หน้าต่างตัดสิน
    req_decide_approve: 'อนุมัติคำขอ',
    req_decide_reject: 'ไม่อนุมัติคำขอ',
    req_decide_note: 'Remark / หมายเหตุ',
    req_decide_note_required: 'ต้องระบุเหตุผลเมื่อไม่อนุมัติ',
    req_decide_note_ph_approve: 'หมายเหตุถึงผู้อนุมัติขั้นถัดไป (ไม่บังคับ)',
    req_decide_note_ph_reject: 'เหตุผลที่ไม่อนุมัติ — จะส่งกลับไปหาผู้ขอ',
    req_decide_notify_reject: 'แจ้งกลับผู้ขอทาง Bell + Email แล้วปิดคำขอ',
    req_decide_notify_final: 'อนุมัติครบ — แจ้งผู้ขอและทีม IT ทาง Bell + Email',
    req_decide_notify_next: 'แจ้งผู้อนุมัติขั้นถัดไปทาง Bell + Email:',
    req_fulfill_title: 'ยืนยันปิดงาน',
    req_fulfill_hint: 'ยืนยันว่างานเสร็จแล้ว ระบบจะแจ้งผู้ขอ',
    req_cancel_title: 'ยกเลิกคำขอนี้?',
    req_cancel_hint: 'ระบบจะแจ้งผู้อนุมัติที่กำลังรอ และปิดคำขอนี้',
};
