import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PageLoader } from '../states/LoadingState';
import type { UserRole } from '../../types';

interface RoleRouteGuardProps {
  allowedRoles: (UserRole | string)[];
  children: React.ReactNode;
  fallbackPath?: string;
}

/**
 * RoleRouteGuard
 * Enforces role-based route access.
 * Prevents unauthorized users from accessing other roles' dashboards or actions.
 */
export default function RoleRouteGuard({ allowedRoles, children, fallbackPath = '/dashboard' }: RoleRouteGuardProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!user) {
    return <Navigate to="/register" replace />;
  }

  const userRole = user.role;
  const isAllowed = allowedRoles.includes(userRole);

  if (!isAllowed) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}
