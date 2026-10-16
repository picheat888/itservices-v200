import type { Dict } from '@/lang/types';

/**
 * My Profile drawer: details, assets, tickets, requests, access tabs
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
    profile_see_all: 'Open the full page',
    profile_no_tickets: "You haven't reported any tickets yet.",
    profile_no_access: "You don't have any access yet.",
    profile_no_requests: "You haven't submitted any requests yet.",
    // my-assets-tab.tsx — แท็บทรัพย์สิน
    my_assets_new: 'New',
    my_assets_return_confirm: 'Send this asset back to IT? It will show as pending return until IT confirms receipt.',
    my_assets_empty: "You don't hold any assets yet.",
    my_assets_no_link: "Your account isn't linked to an employee record yet.",
    profile_assets_pending_caption: 'Awaiting your acceptance',
    profile_assets_held_heading: 'My assets',
    profile_assets_col_handed_over: 'Handed over',
    profile_pending_assets_badge: '{n} awaiting acceptance',
    profile_assets_show_all: 'Show all, {n} more',
    profile_assets_show_less: 'Show less',
    profile_assets_accept_all: 'Accept all',
    profile_assets_accept_all_confirm: 'Confirm you have received all {n} of these assets.',
    profile_assets_accepted: 'Accepted',
    // my-tickets-tab.tsx / my-requests-tab.tsx — Tickets and Requests tabs
    profile_tickets_heading: 'My tickets',
    profile_requests_heading: 'My requests',
};
