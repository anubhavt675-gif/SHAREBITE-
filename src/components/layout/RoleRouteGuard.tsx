import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRoleDashboardPath, isRoleAllowed } from '../../services/auth';
import AuthStateScreen from '../states/AuthStateScreen';
import type { UserRole } from '../../types';

interface RoleRouteGuardProps {
  allowedRoles: (UserRole | string)[];
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * RoleRouteGuard
 * Enforces role-based route access using authoritative profile roles.
 * Includes auto role transition so donors visiting rider features can
 * seamlessly activate rider mode without being bounced back to donor dashboard.
 */
export default function RoleRouteGuard({ allowedRoles, children, fallbackPath }: RoleRouteGuardProps) {
  const { user, authStatus, authError, retryAuth, logout, switchRole } = useAuth();
  const location = useLocation();
  const [switching, setSwitching] = useState(false);
  const [switchAttempted, setSwitchAttempted] = useState(false);

  const isRiderRoute = allowedRoles.includes('rider') || allowedRoles.includes('volunteer');
  const isDonorRoute = allowedRoles.includes('donor') || allowedRoles.includes('partner');

  useEffect(() => {
    // If a donor directly navigates to a rider route, automatically switch to rider mode
    if (
      user &&
      user.role === 'donor' &&
      isRiderRoute &&
      !switching &&
      !switchAttempted
    ) {
      setSwitching(true);
      setSwitchAttempted(true);
      switchRole('rider')
        .catch((err) => {
          console.warn('Auto role switch to rider failed:', err);
        })
        .finally(() => {
          setSwitching(false);
        });
    } else if (
      user &&
      user.role === 'rider' &&
      isDonorRoute &&
      !switching &&
      !switchAttempted
    ) {
      setSwitching(true);
      setSwitchAttempted(true);
      switchRole('donor')
        .catch((err) => {
          console.warn('Auto role switch to donor failed:', err);
        })
        .finally(() => {
          setSwitching(false);
        });
    }
  }, [user, isRiderRoute, isDonorRoute, switching, switchAttempted, switchRole]);

  if (switching) {
    return (
      <AuthStateScreen
        mode="loading"
        message={isRiderRoute ? 'Activating Rider Portal & Dashboard...' : 'Switching to Donor Portal...'}
      />
    );
  }

  if (authStatus === 'initializing' || authStatus === 'loading_profile') {
    return <AuthStateScreen mode="loading" message="Verifying route permissions..." />;
  }

  if (authStatus === 'error' || authStatus === 'profile_missing' || authStatus === 'invalid_role') {
    return (
      <AuthStateScreen
        mode={authStatus}
        message={authError}
        onRetry={retryAuth}
        onSignOut={logout}
      />
    );
  }

  if (!user) {
    return <Navigate to="/register" replace />;
  }

  if (!isRoleAllowed(user.role, allowedRoles)) {
    const authoritativePath = getRoleDashboardPath(user.role);
    const destination =
      fallbackPath && fallbackPath !== '/dashboard' ? fallbackPath : authoritativePath;

    // Prevent infinite self-redirect loop if role is invalid or destination equals current pathname
    if (!destination || destination === location.pathname) {
      return (
        <AuthStateScreen
          mode="invalid_role"
          message={`Your account role ("${user.role}") does not have permission to view this dashboard.`}
          onRetry={retryAuth}
          onSignOut={logout}
        />
      );
    }

    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
