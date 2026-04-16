

# Add Club Manager Role Detection to Auth Flow

## Overview
After auth state changes, query `club_memberships` to detect if the user is a club manager. Expose `isManager`, `managedClubIds`, and `isSuperAdmin` app-wide via context.

## Approach
Extend the existing `AdminContext` (which already checks `has_role`) to also query `club_memberships` for manager-level roles. This keeps all role logic in one place.

## Changes

### 1. Rename and extend `src/contexts/AdminContext.tsx`

- After the existing `has_role` check, query:
  ```sql
  SELECT club_id, role FROM club_memberships
  WHERE user_id = auth.uid()
    AND role IN ('manager', 'admin', 'club_owner', 'club_admin')
    AND active = true
  ```
- Add to context:
  - `isManager: boolean` — true if any rows returned
  - `managedClubIds: string[]` — list of club IDs the user manages
  - `managerRole: string | null` — highest role found
  - `isSuperAdmin: boolean` — true if `isAdmin` is true (existing check via `has_role`). Super-admins can switch between all clubs.

### 2. Update `AdminContextType` interface

```typescript
interface AdminContextType {
  isAdmin: boolean;       // existing — super-admin via user_roles
  isSuperAdmin: boolean;  // alias for isAdmin (can access all clubs)
  isManager: boolean;     // has club management role
  managedClubIds: string[];
  loading: boolean;
}
```

### 3. Update consumers

- `AdminRoute.tsx` — no change needed (still checks `isAdmin`)
- Any future club-management routes can gate on `isManager` or check `managedClubIds.includes(clubId)`

## What stays unchanged
- `AuthContext` — no modifications
- `has_role` RPC call — still used for super-admin detection
- All existing admin routes and guards

## Technical notes
- The `club_memberships` table already has RLS allowing users to read their own rows (via `club_memberships.user_id = auth.uid()`)
- Both queries (has_role + club_memberships) run in parallel for faster loading
- State resets on sign-out (user becomes null → both flags reset)

