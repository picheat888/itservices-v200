export type { AccessKind } from '@/shared/types';
export { accessApi } from './api/accessApi';
export {
    useAccessMutations,
    useAccessSummary,
    useEmailGroups,
    useFileShares,
    useResourceMembers,
    useSocialPlatforms,
} from './hooks/use-access';
export { default as AccessControlPage } from './pages';
