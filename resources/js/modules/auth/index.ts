// Barrel for the auth module — re-exports everything that the rest of the app consumes.

// Hooks
export * from './hooks/use-auth';
export * from './hooks/use-session-timeout';
export * from './hooks/use-user-preferences';

// Page (default export re-exported as a named export so callers use: import { LoginPage } from '@/modules/auth')
export { default as LoginPage } from './pages/login';

// Components
export { ChangePasswordDialog } from './components/change-password-dialog';
export { ProtectedRoute } from './components/protected-route';
export { NoAccess, RequirePermission } from './components/require-permission';
export { SessionTimeoutModal } from './components/session-timeout-modal';

// API
export * from './api/authApi';
export * from './api/preferencesApi';
