import type { Dict } from '@/lang/types';

export const monitor: Dict = {
    // lib/monitor-time.ts — คำบอกเวลา
    mon_min: '{n} น.',
    mon_hour: '{n} ชม.',
    mon_day: '{n} วัน',
    mon_over: 'เกิน {t}',
    mon_left: 'เหลือ {t}',
    mon_waited: 'รอมา {t}',
    mon_just_in: 'เพิ่งเข้ามา',

    // components/monitor-board.tsx — หัวจอ
    mon_tab_title: 'Monitoring Screen',
    mon_title: 'Ticket Monitoring Screen',
    mon_subtitle: 'สถานะเคสตอนนี้',
    mon_updated: 'อัปเดต {t}',
    mon_offline: 'ขาดการเชื่อมต่อ ข้อมูลเมื่อ {t}',
    mon_settings: 'ตั้งค่าจอ',
    mon_lang: 'ภาษา',
    mon_mode: 'โหมด',
    mon_dark: 'มืด',
    mon_light: 'สว่าง',
    mon_sound: 'เสียง',
    mon_on: 'เปิด',
    mon_off: 'ปิด',
    mon_prefs_note: 'จอนี้จำค่าที่ตั้งไว้เอง ไม่เกี่ยวกับบัญชีของใคร',
    mon_connecting: 'กำลังเชื่อมต่อ…',
    mon_connect_retry: 'เชื่อมต่อไม่ได้ กำลังลองใหม่',
    mon_paused: 'หยุดสลับหน้า กด Space เพื่อสลับต่อ',

    // components/monitor-kpis.tsx — ตัวเลขด้านบน
    mon_kpi_waiting: 'รอรับเคส',
    mon_kpi_waiting_foot: 'รอนานสุด {t}',
    mon_kpi_waiting_none: 'ไม่มีเคสรอ',
    mon_kpi_in_progress: 'กำลังดำเนินการ',
    mon_kpi_in_progress_foot: 'ทำอยู่ {n} คน',
    mon_kpi_overdue: 'เกินกำหนด',
    mon_kpi_overdue_foot: 'รับเคสช้า {a} ปิดเคสช้า {b}',
    mon_kpi_near: 'ใกล้ครบกำหนด',
    mon_kpi_near_foot: 'นับเฉพาะเคสที่รับแล้ว',
    mon_kpi_closed: 'ปิดเคสวันนี้',
    mon_kpi_closed_foot: 'ทัน SLA {p}%',

    // components/must-see-list.tsx — รายการต้องดูตอนนี้
    mon_list_title: 'ต้องดูตอนนี้',
    mon_page: 'หน้า {a} จาก {b}',
    mon_group_overdue: 'เกินกำหนด',
    mon_group_near: 'ใกล้ครบกำหนด',
    mon_group_waiting: 'รอรับเคส',
    mon_group_count: '{n} เคส',
    mon_group_count_one: '{n} เคส',
    mon_clock_response: 'กำหนดรับเคส',
    mon_clock_resolve: 'กำหนดปิดเคส',
    mon_unassigned: 'ยังไม่มีผู้รับผิดชอบ',
    mon_no_priority: 'ไม่ระบุ',
    mon_new_tag: 'ใหม่',
    mon_calm_title: 'ไม่มีเคสที่ต้องดูตอนนี้',
    mon_calm_hint: 'ไม่มีเคสเกินกำหนด ใกล้ครบกำหนด หรือรอรับเคส',

    // components/team-panel.tsx — ทีม IT
    mon_team_title: 'ทีม IT ตอนนี้',
    mon_team_hint: 'เคสที่ถืออยู่',

    // components/new-case-popup.tsx — popup เคสใหม่
    mon_popup_one: 'เคสใหม่',
    mon_popup_many: 'เคสใหม่ {n} เคส',
    mon_popup_more: 'อีก {n} เคส',
    mon_popup_department: 'แผนก',
    mon_popup_requester: 'ผู้แจ้ง',
    mon_announce_new: 'เคสใหม่ {n} เคส {title}',

    // components/pairing-screen.tsx — หน้ารหัสจับคู่
    mon_pair_label: 'รหัสจับคู่จอ',
    mon_pair_changes_in: 'รหัสเปลี่ยนใน {t}',
    mon_pair_hint: 'แจ้งผู้ดูแลระบบให้กรอกรหัสนี้',
    mon_pair_retry: 'ขอรหัสไม่ได้ กำลังลองใหม่',
    mon_unpaired_banner: 'จอนี้ถูกยกเลิกการจับคู่แล้ว จับคู่ใหม่ได้ด้วยรหัสด้านล่าง',

    // components/start-screen.tsx — หน้าเริ่มใช้งาน
    mon_paired_title: 'จับคู่จอแล้ว',
    mon_start_hint: 'กดหนึ่งครั้ง จอจะได้เล่นเสียงเมื่อมีเคสใหม่',
    mon_start_sound: 'เริ่มพร้อมเสียง',
    mon_start_enter: 'หรือกด Enter',
    mon_start_silent: 'เริ่มแบบไม่มีเสียง',
};
