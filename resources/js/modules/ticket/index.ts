import { lazyPage } from '@/shared/lib/lazy-page';
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
export { useTicketMutations, useTickets, useTicketStaff, useTicketSummary } from './hooks/use-tickets';
export const TicketsPage = lazyPage(() => import('./pages'));
