// Per-type filing keys (mirror App\Support\Permissions requests.submit_<type>).
import type { ServiceRequestType } from '@/shared/types';

export const REQUEST_SUBMIT_TYPE_KEY: Record<ServiceRequestType, string> = {
    computer: 'requests.submit_computer',
    hardware: 'requests.submit_hardware',
    mobile: 'requests.submit_mobile',
    email: 'requests.submit_email',
    social: 'requests.submit_social',
    fileshare: 'requests.submit_fileshare',
    software: 'requests.submit_software',
    recovery: 'requests.submit_recovery',
    mailgroup: 'requests.submit_mailgroup',
    telephone: 'requests.submit_telephone',
    network: 'requests.submit_network',
    cctv: 'requests.submit_cctv',
    other: 'requests.submit_other',
};

/** True when the user may file a request of at least one type. */
export function canFileAnyRequest(can: (key: string) => boolean): boolean {
    return can('requests.submit') && Object.values(REQUEST_SUBMIT_TYPE_KEY).some((key) => can(key));
}
