/**
 * Workflow module barrel — approval-route definitions (admin) plus the shared
 * WorkflowStrip visual the Request module reuses for its route previews.
 */
import { lazyPage } from '@/shared/lib/lazy-page';
export { workflowApi } from './api/workflowApi';
export type { ResolvedPreviewRow, WorkflowUpdatePayload } from './api/workflowApi';
export { WorkflowStrip } from './components/workflow-strip';
export { useWorkflowMutations, useWorkflows } from './hooks/use-workflows';
export const WorkflowsPage = lazyPage(() => import('./pages'));
