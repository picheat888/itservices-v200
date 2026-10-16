// Where each Dashboard tile, row and section leads, or null when the place it opens is closed to the reader (pure, node tests).

type Can = (permission: string) => boolean;

// The sidebar's own gates for the two self-service modules.
const TICKETS_ANY = ['tickets.module', 'tickets.create', 'tickets.my'];
const REQUESTS_ANY = ['requests.module', 'requests.submit', 'requests.view_all', 'requests.complete'];
const PROFILE = '?dialog=profile&section=';

/** `linkedEmployee`: the account has an employee record — the profile drawer's rule for its Assets and Access tabs. */
export function dashLinks(can: Can, linkedEmployee: boolean) {
    const tickets = TICKETS_ANY.some(can);
    const requests = REQUESTS_ANY.some(can);
    const desk = can('tickets.view_all');
    const oversee = can('requests.view_all');

    return {
        // Tickets tabs, each behind the permission the page checks for it
        myJobs: can('tickets.jobs') ? '/tickets?tab=mine' : null,
        myTickets: can('tickets.my') ? '/tickets?tab=my' : null,
        pickup: desk ? '/tickets?tab=all&status=open' : null,
        approvals: requests ? '/requests?tab=approvals' : null,
        awaitingIt: oversee ? '/requests?tab=all&status=approved' : null,
        expiring: can('contracts.module') ? '/contracts?tab=all&status=expiring' : null,
        // Profile drawer sections, each behind the rule the drawer uses
        myRequests: can('requests.submit') ? `${PROFILE}requests` : null,
        profileAssets: linkedEmployee ? `${PROFILE}assets` : null,
        profileAccess: linkedEmployee ? `${PROFILE}access` : null,
        ticket: (id: number) => (tickets ? `/tickets?view=${id}` : null),
        request: (id: number) => (requests ? `/requests?view=${id}` : null),
        ticketsHome: tickets ? '/tickets' : null,
        ticketsAll: desk ? '/tickets?tab=all' : null,
        // The overview report on the window the SLA tiles count (the report needs both rights)
        slaReport: (from: string, to: string) => (desk && can('tickets.resolve') ? `/reports/tickets-overview?from=${from}&to=${to}` : null),
        requestsHome: requests ? '/requests' : null,
        requestsAll: oversee ? '/requests?tab=all' : null,
        requestsStatus: (status: string) => (oversee ? `/requests?tab=all&status=${status}` : null),
        employeesHome: can('employees.module') ? '/employees' : null,
        auditLog: can('system.manage_permissions') && can('system.view_audit') ? '/permissions?tab=logs' : null,
    };
}

export type DashLinks = ReturnType<typeof dashLinks>;
