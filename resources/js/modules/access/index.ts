export type { AccessKind } from '@/shared/types';
export { accessApi } from './api/accessApi';
export { AccessBadge } from './components/access-badge';
export {
    useAccessMutations,
    useAccessSummary,
    useEmailGroups,
    useFileShares,
    useMyAccess,
    useResourceMembers,
    useSocialPlatforms,
} from './hooks/use-access';
export { default as AccessControlPage } from './pages';
