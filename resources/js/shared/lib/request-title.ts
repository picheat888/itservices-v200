// What a service request is called in the reader's language, and its label key per type.
// Free of React (no icons) so the service worker and node tests can load it.
import type { ServiceRequest, ServiceRequestType } from '@/shared/types';

/** i18n key per service type, spelled out so the keys stay greppable. */
export const REQUEST_TYPE_LABEL_KEY: Record<ServiceRequestType, string> = {
    computer: 'req_computer',
    hardware: 'req_hardware',
    mobile: 'req_mobile',
    email: 'req_email',
    social: 'req_social',
    fileshare: 'req_fileshare',
    software: 'req_software',
    recovery: 'req_recovery',
    mailgroup: 'req_mailgroup',
    telephone: 'req_telephone',
    network: 'req_network',
    cctv: 'req_cctv',
    other: 'req_other',
};

/** Filed by someone else for the person it is for (a new hire's onboarding request). */
export function isOnBehalfRequest(request: Pick<ServiceRequest, 'origin'>): boolean {
    return request.origin === 'onboarding';
}

/** Derived from `type` in the reader's language; an on-behalf request also names who it is for. */
export function requestTitle(
    request: Pick<ServiceRequest, 'type' | 'origin'> & { requester?: { name: string; name_th?: string | null } },
    t: (key: string) => string,
    lang: string,
): string {
    const service = t(REQUEST_TYPE_LABEL_KEY[request.type]);
    // Same pick as localName(); inlined so node --test can load this file
    const forWhom = request.requester ? (lang === 'th' && request.requester.name_th) || request.requester.name : null;

    return isOnBehalfRequest(request) && forWhom
        ? t('req_auto_title_for').replace('{service}', service).replace('{name}', forWhom)
        : t('req_auto_title').replace('{service}', service);
}
