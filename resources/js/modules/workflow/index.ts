/**
 * Workflow module barrel — approval-route definitions (admin) plus the shared
 * WorkflowStrip visual the Request module reuses for its route previews.
 */
export { workflowApi } from './api/workflowApi';
export type { ResolvedPreviewRow, WorkflowUpdatePayload } from './api/workflowApi';
export { WorkflowStrip, fmtSla } from './components/workflow-strip';
export { useWorkflowMutations, useWorkflows } from './hooks/use-workflows';
export { default as WorkflowsPage } from './pages';
