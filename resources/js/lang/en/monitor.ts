import type { Dict } from '@/lang/types';

export const monitor: Dict = {
    // lib/monitor-time.ts — time words
    mon_min: '{n} min',
    mon_hour: '{n} h',
    mon_day: '{n} d',
    mon_over: '{t} overdue',
    mon_left: '{t} left',
    mon_waited: 'Waiting {t}',
    mon_just_in: 'Just in',

    // components/monitor-board.tsx — header
    mon_tab_title: 'Monitoring Screen',
    mon_title: 'IT case monitor',
    mon_subtitle: 'Cases right now',
    mon_updated: 'Updated {t}',
    mon_offline: 'Offline, data from {t}',
    mon_sound_on: 'Sound on',
    mon_sound_off: 'Turn on sound',
    mon_connecting: 'Connecting…',
    mon_connect_retry: 'Cannot connect, trying again',
    mon_paused: 'Paused, press Space to resume',

    // components/monitor-kpis.tsx — numbers on top
    mon_kpi_waiting: 'Waiting',
    mon_kpi_waiting_foot: 'Longest wait {t}',
    mon_kpi_waiting_none: 'Nothing waiting',
    mon_kpi_in_progress: 'In progress',
    mon_kpi_in_progress_foot: '{n} staff working',
    mon_kpi_overdue: 'Overdue',
    mon_kpi_overdue_foot: '{a} late pickup, {b} late close',
    mon_kpi_near: 'Due soon',
    mon_kpi_near_foot: 'Taken cases only',
    mon_kpi_closed: 'Closed today',
    mon_kpi_closed_foot: '{p}% within SLA',

    // components/must-see-list.tsx — must-see list
    mon_list_title: 'Needs attention',
    mon_page: 'Page {a} of {b}',
    mon_group_overdue: 'Overdue',
    mon_group_near: 'Due soon',
    mon_group_waiting: 'Waiting',
    mon_group_count: '{n} cases',
    mon_clock_response: 'Pickup deadline',
    mon_clock_resolve: 'Close deadline',
    mon_unassigned: 'No one assigned',
    mon_no_priority: 'Not set',
    mon_new_tag: 'New',
    mon_calm_title: 'Nothing needs attention',
    mon_calm_hint: 'No overdue, due-soon or waiting cases',

    // components/team-panel.tsx — IT team
    mon_team_title: 'IT team now',
    mon_team_hint: 'Cases held',

    // components/new-case-popup.tsx — new case popup
    mon_popup_one: 'New case',
    mon_popup_many: '{n} new cases',
    mon_popup_more: '{n} more',
    mon_popup_department: 'Department',
    mon_popup_requester: 'Reported by',
    mon_announce_new: '{n} new cases {title}',

    // components/pairing-screen.tsx — pairing code
    mon_pair_label: 'Screen pairing code',
    mon_pair_changes_in: 'Code changes in {t}',
    mon_pair_hint: 'Ask an administrator to enter this code',
    mon_pair_retry: 'Could not get a code, trying again',
    mon_unpaired_banner: 'This screen was unpaired. Pair it again with the code below',

    // components/start-screen.tsx — start
    mon_paired_title: 'Screen paired',
    mon_start_hint: 'Press once so the screen can play a sound for new cases',
    mon_start_sound: 'Start with sound',
    mon_start_enter: 'Or press Enter',
    mon_start_silent: 'Start without sound',
};
