import type { Dict } from '@/lang/types';

/**
 * โมดูล Workflow (ตั้งค่าสายการอนุมัติ สำหรับแอดมิน) — ข้อความภาษาไทย
 *
 * ชื่อโมดูลใช้คำว่า "Workflow" ตรง ๆ (เมนู + หัวข้อหน้า + ปุ่ม/ช่องค้นหา) ส่วนคำว่า
 * "สายอนุมัติ / สายบังคับบัญชา" สงวนไว้ให้ความหมาย "ลำดับคนที่อนุมัติจริง" เท่านั้น
 */
export const workflow: Dict = {
    wf_title: 'Workflow',
    wf_sub: 'กำหนดว่าคำขอแต่ละประเภทต้องผ่านใครอนุมัติ และเรียงลำดับอย่างไร',

    // pages/index.tsx — การ์ด KPI
    wf_kpi_active: 'Workflow ที่เปิดใช้',
    wf_kpi_active_sub: 'จากทั้งหมด {n} ประเภทคำขอ',
    wf_kpi_steps: 'ขั้นอนุมัติรวม',
    wf_kpi_steps_sub: 'สูงสุด',
    wf_kpi_steps_sub_tail: 'ขั้นต่อคำขอ',
    wf_kpi_decision: 'เวลาพิจารณาเฉลี่ย',
    wf_kpi_decision_window: '{days} วันที่ผ่านมา',
    wf_kpi_decision_requests: 'คำขอ',
    wf_kpi_decision_none: 'ไม่มีคำขอที่พิจารณาเสร็จใน {days} วันที่ผ่านมา',
    wf_row_decision: 'พิจารณาเฉลี่ย',
    wf_cell_decision: 'เวลาพิจารณาเฉลี่ย ({days} วันที่ผ่านมา)',
    wf_days_suffix: ' วัน',
    wf_kpi_auto: 'เปิด Ticket อัตโนมัติ',
    wf_kpi_auto_sub: 'เปิดเคสให้ IT อัตโนมัติเมื่ออนุมัติครบ',

    // pages/index.tsx — ช่องค้นหา + การ์ด Workflow
    wf_search_ph: 'ค้นหาชื่อ, ประเภทคำขอ หรือขั้นอนุมัติ…',
    wf_search_hint: 'ระบบหาผู้อนุมัติจากสายบังคับบัญชาจริงของผู้ขอ ตอนที่ยื่นคำขอ',
    wf_view: 'ดู',
    wf_edit: 'แก้ไข',
    wf_active: 'เปิดใช้งาน',
    wf_inactive: 'ปิดใช้งาน',
    wf_auto_ticket: 'เปิด Ticket อัตโนมัติ',
    wf_applies_to: 'ใช้กับคำขอ',
    wf_steps: 'ขั้นตอน',

    // workflow-strip.tsx — แถบลำดับสถานะ
    wf_approval: 'ผู้อนุมัติ',
    wf_completion: 'ปิดงาน',
    wf_completion_role: 'ปิดงานหลังอนุมัติครบ',
    wf_submitted: 'ยื่นคำขอ',
    wf_closed: 'เสร็จสิ้น',

    // workflow-view-dialog.tsx — หน้าต่างดูรายละเอียด
    wf_chain_title: 'ลำดับขั้นตอน',
    wf_step_detail: 'รายละเอียดขั้นตอน',

    // workflow-editor-dialog.tsx — ตัวแก้ไข
    wf_editor_eyebrow: 'แก้ไข Workflow',
    wf_name: 'ชื่อ Workflow',
    wf_name_required: 'ตั้งชื่อ Workflow ก่อนบันทึก',
    wf_auto_ticket_hint: 'หลังอนุมัติครบ ระบบเปิดเคสให้ทีม IT',
    wf_add_step: 'เพิ่มขั้นตอน',
    wf_step_label: 'ชื่อขั้น',
    wf_step_type: 'ประเภทขั้น',
    wf_step_move_up: 'เลื่อนขั้นที่ {n} ขึ้น',
    wf_step_move_down: 'เลื่อนขั้นที่ {n} ลง',
    wf_step_remove: 'ลบขั้นที่ {n}',
    wf_step_positions: 'อนุมัติโดย',
    wf_step_positions_required: 'เลือกอย่างน้อย 1 ตำแหน่ง ไม่อย่างนั้นขั้นนี้จะหาผู้อนุมัติไม่ได้',
    wf_ranks_edit: 'แก้ไข',
    wf_ranks_done: 'เสร็จ',
    wf_actor_chain: 'สายบังคับบัญชา',
    wf_actor_department: 'ระบุฝ่าย',
    wf_steps_count: '{n} ขั้นอนุมัติ',
    wf_step_skip_note_chain: 'ข้ามขั้นนี้ถ้าในสายของผู้ขอไม่มีใครอยู่ตำแหน่งเหล่านี้',
    wf_step_skip_note_department: 'ข้ามขั้นนี้ถ้าฝ่ายนี้ไม่มีใครอยู่ตำแหน่งเหล่านี้',
    wf_step_department: 'ฝ่าย',
    wf_step_department_pick: 'เลือกฝ่าย',
    wf_step_department_required: 'เลือกฝ่ายที่อนุมัติขั้นนี้',
    wf_step_who: 'ใครอนุมัติ',
    wf_step_by_positions: 'ใครก็ได้ในตำแหน่งที่เลือก',
    wf_step_by_person: 'ระบุคน',
    wf_step_person_add: 'เพิ่มคน',
    wf_step_person_remove: 'เอาออก',
    wf_step_people_note: 'คนใดคนหนึ่งอนุมัติก็ผ่าน ไม่ต้องครบทุกคน',
    wf_step_person_required: 'เลือกอย่างน้อย 1 คนที่อนุมัติขั้นนี้ได้',
    wf_step_department_empty: 'ฝ่ายนี้ยังไม่มีพนักงาน ใช้แบบตามตำแหน่งไปก่อน หรือกลับมาเลือกคนเมื่อมีพนักงานแล้ว',
    wf_any_of_preview: 'ใครอนุมัติก่อนก็ผ่าน',
    wf_actor_owner: 'เจ้าของ Resource',
    wf_actor_it: 'ทีม IT',
    wf_preset_supervisor_head: 'Supervisor / Head',
    wf_preset_manager_asst: 'Manager / Asst. Manager',
    wf_preset_department_manager: 'Department Manager',
    wf_preset_vice_president: 'Vice President',
    wf_test_with: 'ทดสอบกับ:',
    wf_preview_loading: 'กำลังหาผู้อนุมัติ…',
    wf_preview_error: 'ทดสอบเส้นทางไม่สำเร็จ ลองเลือกพนักงานอีกครั้ง',
    wf_resolve_title: 'ทดสอบกับสายบังคับบัญชาจริง',
    wf_resolve_hint:
        'แต่ละขั้นจะไล่ขึ้นไปตามสายบังคับบัญชาของผู้ขอ จนเจอคนที่อยู่ในตำแหน่งที่กำหนด ถ้าไม่เจอ ขั้นนั้นจะถูกข้าม ส่วนขั้นเจ้าของ Resource จะรู้ว่าเป็นใครเมื่อผู้ขอเลือก Resource ตอนยื่นคำขอ',
    wf_skipped: 'ข้ามขั้นนี้',
    wf_covers: 'อนุมัติแทน',
    wf_owner_preview: 'รู้ว่าเป็นใครเมื่อผู้ขอเลือก Resource',
    wf_queue_preview: 'เข้าคิวทีม IT และเปิด Ticket อัตโนมัติ',
    wf_save_error_steps: 'บันทึกไม่สำเร็จ ตรวจรายการขั้นตอนอีกครั้ง',

    // empty states — การ์ดและตารางที่ไม่มีข้อมูล
    wf_empty_list: 'ยังไม่มี Workflow',
    wf_empty_list_hint: 'Workflow มาตรฐานสร้างตอนติดตั้งระบบ',
    wf_empty_list_search: 'ไม่พบ Workflow ที่ตรงกับคำค้น',
    wf_empty_list_search_hint: 'ลองค้นด้วยคำอื่น',
};
