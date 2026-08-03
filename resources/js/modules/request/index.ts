/**
 * Request module barrel — IT service requests riding the Workflow module's
 * approval chains (submit → per-step approval → auto ticket → fulfillment).
 */
export { requestApi } from './api/requestApi';
export type { RequestListParams, RequestPageMeta, RequestPageResponse, RequestTypeOption, SubmitRequestPayload } from './api/requestApi';
export { useRequest, useRequestMutations, useRequestOptions, useRequests } from './hooks/use-requests';
export { default as RequestsPage } from './pages';
