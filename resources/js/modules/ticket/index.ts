export { ticketApi } from './api/ticketApi';
export type { CreateTicketPayload, TicketListParams, TicketPageMeta, TicketPageResponse } from './api/ticketApi';
export {
    TICKET_CATEGORIES,
    TICKET_PRIORITY_META,
    TICKET_STATUS_META,
    TicketCategoryIcon,
    TicketPriorityBadge,
    TicketStatusBadge,
} from './components/ticket-meta';
export { useTicketMutations, useTicketStaff, useTicketSummary, useTickets } from './hooks/use-tickets';
export { default as TicketsPage } from './pages';
