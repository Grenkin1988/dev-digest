import type { AuthProvider } from '@devdigest/shared';

/** DB-free AuthProvider for hermetic route tests (the real one reads Postgres). */
export const fakeAuth: AuthProvider = {
  async currentUser() {
    return { id: 'u-test', email: 'test@example.com', name: 'Test' };
  },
  async currentWorkspace() {
    return { id: 'w-test', name: 'test' };
  },
};
