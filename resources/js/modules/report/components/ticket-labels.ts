/** Ticket enum values → the ticket module's existing i18n keys (no duplicate strings in report.ts). */
export const categoryKey = (category: string) => `ticket_cat_${category}`;
export const priorityKey = (priority: string) => `ticket_prio_${priority}`;
export const statusKey = (status: string) => `ticket_${status}`;
