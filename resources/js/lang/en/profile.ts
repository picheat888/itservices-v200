import type { Dict } from '@/lang/types';

/**
 * My Profile drawer: details, assets, tickets, requests, access, sign-ins tabs
 */
export const profile: Dict = {
    // profile-drawer.tsx — cover, rail, footer
    profile_name: 'Name',
    profile_change_photo: 'Change photo',
    profile_name_required: 'Please enter your first name',
    profile_last_name_required: 'Please enter your last name',
    profile_save_failed: "Couldn't save your profile. Please try again.",
    profile_details: 'Employee details',
    profile_account: 'Login account',
    profile_contact: 'Contact',
    profile_tab_details: 'Personal info',
    profile_tab_devices: 'Sign-ins',
    // my-assets-tab.tsx — แท็บทรัพย์สิน
    my_assets_new: 'New',
    my_assets_return_confirm: 'Send this asset back to IT? It will show as pending return until IT confirms receipt.',
    profile_assets_pending_caption: 'Waiting for you to accept',
    profile_assets_held_heading: 'My assets',
    profile_assets_col_handed_over: 'Handed over',
    profile_pending_assets_badge: '{n} awaiting acceptance',
    profile_assets_show_all: 'Show {n} more',
    profile_assets_show_less: 'Show less',
    profile_assets_accept_all: 'Accept all',
    profile_assets_accept_all_confirm: 'Confirm you have received all {n} of these assets.',
    profile_assets_accepted: 'Accepted',
    // my-devices-tab.tsx — แท็บการเข้าสู่ระบบ
    profile_devices_heading: 'Devices signed in',
    profile_devices_limit_note: 'Up to {n} devices at a time',
    profile_device_current: 'This device',
    profile_device_remembered: 'Remembered until {date}',
    profile_device_signed_in: 'Signed in {time}',
    profile_device_end_title: 'Sign out the selected device',
    profile_device_end_desc: 'The selected device is signed out at once and must sign in again to keep working.',
    profile_device_ended: '{device} signed out',
    profile_logins_heading: 'Recent sign-ins',
    profile_logins_col_time: 'Time',
    profile_logins_col_event: 'Event',
    profile_logins_col_device: 'Device',
    profile_logins_col_place: 'Location',
    profile_logins_hint: 'Shows the last 10 for this account. If you see a sign-in that was not you, change your password and tell IT.',

    // empty states — การ์ดและตารางที่ไม่มีข้อมูล
    profile_empty_assets_held: 'You hold no assets',
    profile_empty_assets_held_hint: 'Assets handed to you show here.',
    profile_empty_tickets: 'You have not filed a ticket',
    profile_empty_tickets_hint: 'Report an IT problem with "{button}".',
    profile_empty_requests: 'You have not submitted a request',
    profile_empty_requests_hint: 'Submit one on the Requests page.',
    profile_empty_access: 'No access recorded for you yet',
    profile_empty_access_hint: 'Ask for access on the Requests page.',
    profile_empty_devices: 'No devices are signed in',
    profile_empty_logins: 'No sign-in history yet',
};
