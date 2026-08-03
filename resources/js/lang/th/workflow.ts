import type { Dict } from '@/lang/types';

/**
 * โมดูล Workflow (ตั้งค่าสายการอนุมัติ สำหรับแอดมิน) — ข้อความภาษาไทย
 *
 * ชื่อโมดูลใช้คำว่า "Workflow" ตรง ๆ (เมนู + หัวข้อหน้า + ปุ่ม/ช่องค้นหา) ส่วนคำว่า
 * "สายอนุมัติ / สายบังคับบัญชา" สงวนไว้ให้ความหมาย "ลำดับคนที่อนุมัติจริง" เท่านั้น
 */
export const workflow: Dict = {
    wf_title: 'Workflow',
    wf_sub: 'กำหนดเส้นทางอนุมัติของคำขอแต่ละประเภท — ใครอนุมัติ ลำดับไหน ภายในกี่วัน',
    wf_new: 'สร้าง Workflow ใหม่',
    wf_coming_soon: 'เร็ว ๆ นี้',

    wf_kpi_active: 'Workflow ที่เปิดใช้',
    wf_kpi_active_sub: 'ประเภทคำขอที่ครอบคลุม',
    wf_kpi_steps: 'ขั้นอนุมัติรวม',
    wf_kpi_steps_sub: 'สูงสุด',
    wf_kpi_steps_sub_tail: 'ขั้นต่อคำขอ',
    wf_kpi_sla: 'SLA เฉลี่ยต่อ Workflow',
    wf_kpi_sla_sub: 'ตั้งแต่ยื่นจนปิดเคส',
    wf_kpi_auto: 'เปิด Auto Ticket',
    wf_kpi_auto_sub: 'เปิดเคสให้ IT อัตโนมัติเมื่ออนุมัติครบ',

    wf_search_ph: 'ค้นหา Workflow…',
    wf_search_hint: 'ทุกขั้นจะถูกจับคู่กับสายบังคับบัญชาจริงของผู้ขอ ณ ตอนยื่น',
    wf_no_match: 'ไม่พบ Workflow ที่ค้นหา',
    wf_view: 'ดู',
    wf_edit: 'แก้ไข',
    wf_active: 'เปิดใช้งาน',
    wf_inactive: 'ปิดใช้งาน',
    wf_auto_ticket: 'Auto Ticket',
    wf_no_auto_ticket: 'ไม่เปิดเคสอัตโนมัติ',
    wf_applies_to: 'ใช้กับคำขอ',
    wf_steps: 'ขั้นตอน',
    wf_total_sla: 'SLA รวม',
    wf_status: 'สถานะ',
    wf_approval: 'ขั้นอนุมัติ',
    wf_fulfillment: 'ขั้นดำเนินการ',
    wf_submitted: 'ยื่นคำขอ',
    wf_closed: 'ปิดเคส',
    wf_chain_title: 'ลำดับขั้นตอน',
    wf_step_detail: 'รายละเอียดขั้นตอน',
    wf_auto_ticket_footnote: 'เมื่ออนุมัติครบ ระบบจะเปิด Ticket ให้ทีม IT อัตโนมัติ',

    // ตัวแก้ไข
    wf_editor_eyebrow: 'แก้ไข Workflow',
    wf_auto_ticket_hint: 'หลังอนุมัติครบ ระบบเปิดเคสให้ทีม IT',
    wf_add_step: 'เพิ่มขั้นตอน',
    wf_step_actor: 'ผู้ดำเนินการ',
    wf_step_label: 'ป้ายที่แสดง',
    wf_step_kind: 'ชนิดขั้นตอน',
    wf_step_sla: 'SLA (วัน)',
    wf_actor_chain: 'สายบังคับบัญชา',
    wf_actor_owner: 'เจ้าของ Resource',
    wf_actor_it: 'ทีม IT',
    wf_preview_title: 'ตัวอย่างสายอนุมัติ',
    wf_test_with: 'ทดสอบกับ:',
    wf_resolve_title: 'รันตามสายบังคับบัญชาจริง',
    wf_resolve_hint: 'ขั้นแบบสายบังคับบัญชาจะถูกแทนที่ด้วยหัวหน้าจริงของผู้ขอ หากสายสั้น คนเดียวอาจอนุมัติแทนหลายขั้น ส่วนขั้นเจ้าของ Resource จะรู้ตัวจริงเมื่อผู้ขอเลือก Resource ตอนยื่น',
    wf_requester: 'ผู้ขอ',
    wf_skipped: 'ข้ามขั้นนี้',
    wf_covers: 'อนุมัติแทน',
    wf_owner_preview: 'ระบุตัวจริงเมื่อเลือก Resource ตอนยื่นคำขอ',
    wf_queue_preview: 'คิวทีม IT · เปิด Ticket อัตโนมัติ',
    wf_save_error_steps: 'ตรวจสอบรายการขั้นตอน',
    wf_days: ' วัน',
};
