export { default as AccessControlPage } from './pages';
export {
    useAccessSummary,
    useAccessSidebarBadge,
    useEmailGroups,
    useFileShares,
    useSocialPlatforms,
    useResourceMembers,
    useEmployeeAccess,
    useAccessMutations,
} from './hooks/use-access';
export { accessApi } from './api/accessApi';
export type { AccessKind } from '@/shared/types';
