// Where each Dashboard tile, row and section leads, or null when the reader's module rights do not open it (pure, node tests).

type Can = (permission: string) => boolean;

// The sidebar's own gates for the two self-service modules.
const TICKETS_ANY = ['tickets.module', 'tickets.create', 'tickets.my'];
const REQUESTS_ANY = ['requests.module', 'requests.submit', 'requests.view_all', 'requests.complete'];

export function dashLinks(can: Can) {
    const tickets = TICKETS_ANY.some(can);
    const requests = REQUESTS_ANY.some(can);
    const desk = can('tickets.view_all');
    const oversee = can('requests.view_all');

    return {
        myJobs: can('tickets.module') ? '/tickets?tab=mine' : null,
        pickup: desk ? '/tickets?tab=all&status=open' : null,
        approvals: requests ? '/requests?tab=approvals' : null,
        awaitingIt: oversee ? '/requests?tab=all&status=approved' : null,
        expiring: can('contracts.module') ? '/contracts?tab=all&status=expiring' : null,
        myTickets: tickets ? '/tickets?tab=my' : null,
        myRequests: requests ? '/requests?tab=all' : null,
        ticket: (id: number) => (tickets ? `/tickets?view=${id}` : null),
        request: (id: number) => (requests ? `/requests?view=${id}` : null),
        ticketsHome: tickets ? '/tickets' : null,
        ticketsAll: desk ? '/tickets?tab=all' : null,
        ticketsOverview: can('tickets.view_dashboard') ? '/tickets?tab=overview' : null,
        requestsHome: requests ? '/requests' : null,
        requestsAll: oversee ? '/requests?tab=all' : null,
        requestsStatus: (status: string) => (oversee ? `/requests?tab=all&status=${status}` : null),
        employeesHome: can('employees.module') ? '/employees' : null,
        auditLog: can('system.manage_permissions') ? '/permissions?tab=logs' : null,
    };
}

export type DashLinks = ReturnType<typeof dashLinks>;
