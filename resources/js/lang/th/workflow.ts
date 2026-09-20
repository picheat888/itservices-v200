import type { Dict } from '@/lang/types';

/**
 * โมดูล Workflow (ตั้งค่าสายการอนุมัติ สำหรับแอดมิน) — ข้อความภาษาไทย
 *
 * ชื่อโมดูลใช้คำว่า "Workflow" ตรง ๆ (เมนู + หัวข้อหน้า + ปุ่ม/ช่องค้นหา) ส่วนคำว่า
 * "สายอนุมัติ / สายบังคับบัญชา" สงวนไว้ให้ความหมาย "ลำดับคนที่อนุมัติจริง" เท่านั้น
 */
export const workflow: Dict = {
    wf_title: 'Workflow',
    wf_sub: 'ปรับเส้นทางอนุมัติของคำขอแต่ละประเภท - ใครอนุมัติ และลำดับไหน',
    wf_coming_soon: 'เร็ว ๆ นี้',

    // pages/index.tsx — การ์ด KPI
    wf_kpi_active: 'Workflow ที่เปิดใช้',
    wf_kpi_active_sub: 'ประเภทคำขอที่ครอบคลุม',
    wf_kpi_steps: 'ขั้นอนุมัติรวม',
    wf_kpi_steps_sub: 'สูงสุด',
    wf_kpi_steps_sub_tail: 'ขั้นต่อคำขอ',
    wf_kpi_decision: 'เวลาตัดสินใจโดยเฉลี่ย',
    wf_kpi_decision_window: 'ช่วง {days} วันย้อนหลัง',
    wf_kpi_decision_requests: 'คำขอ',
    wf_kpi_decision_none: 'ไม่มีคำขอที่ตัดสินใจใน {days} วันย้อนหลัง',
    wf_row_decision: 'ตัดสินใจโดยเฉลี่ย',
    wf_cell_decision: 'ตัดสินใจโดยเฉลี่ย (ช่วง {days} วัน)',
    wf_days_suffix: ' วัน',
    wf_kpi_auto: 'เปิด Auto Ticket',
    wf_kpi_auto_sub: 'เปิดเคสให้ IT อัตโนมัติเมื่ออนุมัติครบ',

    // pages/index.tsx — ช่องค้นหา + การ์ด Workflow
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
    wf_status: 'สถานะ',

    // workflow-strip.tsx — แถบลำดับสถานะ
    wf_approval: 'ผู้อนุมัติ',
    wf_fulfillment: 'ผู้ดำเนินการ',
    wf_fulfillment_role: 'ผู้ดำเนินการหลังอนุมัติจบ',
    wf_submitted: 'ยื่นคำขอ',
    wf_closed: 'ปิดเคส',

    // workflow-view-dialog.tsx — หน้าต่างดูรายละเอียด
    wf_chain_title: 'ลำดับขั้นตอน',
    wf_step_detail: 'รายละเอียดขั้นตอน',

    // workflow-editor-dialog.tsx — ตัวแก้ไข
    wf_editor_eyebrow: 'แก้ไข Workflow',
    wf_name: 'ชื่อ Workflow',
    wf_auto_ticket_hint: 'หลังอนุมัติครบ ระบบเปิดเคสให้ทีม IT',
    wf_add_step: 'เพิ่มขั้นตอน',
    wf_step_label: 'ป้ายที่แสดง',
    wf_step_positions: 'อนุมัติโดย',
    wf_step_positions_required: 'ยังไม่ได้เลือกตำแหน่ง - ขั้นนี้จะหาผู้อนุมัติไม่ได้',
    wf_ranks_edit: 'แก้ไข',
    wf_ranks_done: 'เสร็จ',
    wf_actor_chain: 'สายบังคับบัญชา',
    wf_actor_department: 'ระบุฝ่าย',
    wf_steps_count: '{n} ขั้นอนุมัติ',
    wf_step_skip_note_chain: 'ข้ามขั้นนี้ถ้าไม่มีใครเหนือผู้ขอถือตำแหน่งนี้',
    wf_step_skip_note_department: 'ข้ามขั้นนี้ถ้าฝ่ายนี้ไม่มีใครในตำแหน่งนี้',
    wf_step_department: 'ฝ่าย',
    wf_step_department_pick: 'เลือกฝ่าย',
    wf_step_department_required: 'เลือกฝ่ายที่อนุมัติขั้นนี้',
    wf_step_who: 'ผู้เซ็น',
    wf_step_by_positions: 'ใครก็ได้ในตำแหน่งนี้',
    wf_step_by_person: 'ระบุตัวบุคคล',
    wf_step_person_add: 'เพิ่มบุคคล',
    wf_step_person_remove: 'เอาออก',
    wf_step_people_note: 'คนใดคนหนึ่งเซ็นก็ผ่าน ไม่ต้องครบทุกคน',
    wf_step_person_required: 'เลือกอย่างน้อย 1 คนที่อนุมัติขั้นนี้ได้',
    wf_step_department_empty: 'ฝ่ายนี้ยังไม่มีพนักงาน - รอมีคนก่อนจึงระบุตัวบุคคลได้ หรือใช้อนุมัติตามตำแหน่งแทน',
    wf_any_of_preview: 'ใครในนี้เซ็นก่อนก็ถือว่าผ่าน',
    wf_actor_owner: 'เจ้าของ Resource',
    wf_actor_it: 'ทีม IT',
    wf_test_with: 'ทดสอบกับ:',
    wf_resolve_title: 'รันตามสายบังคับบัญชาจริง',
    wf_resolve_hint:
        'แต่ละขั้นจะไต่สายบังคับบัญชาของผู้ขอขึ้นไปหาคนที่ถือตำแหน่งตามที่ขั้นนั้นระบุ ถ้าไม่มีใครในสายถือตำแหน่งนั้น ขั้นนั้นจะถูกข้าม ส่วนขั้นเจ้าของ Resource จะรู้ตัวจริงเมื่อผู้ขอเลือก Resource ตอนยื่น',
    wf_requester: 'ผู้ขอ',
    wf_skipped: 'ข้ามขั้นนี้',
    wf_covers: 'อนุมัติแทน',
    wf_owner_preview: 'ระบุตัวจริงเมื่อเลือก Resource ตอนยื่นคำขอ',
    wf_queue_preview: 'คิวทีม IT · เปิด Ticket อัตโนมัติ',
    wf_save_error_steps: 'ตรวจสอบรายการขั้นตอน',
};
