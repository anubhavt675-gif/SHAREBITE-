import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthService, clearLegacyAuthCaches } from '../services/auth';
import type { AuthStatus, User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  retryAuth: () => Promise<void>;
  login: (email: string, password?: string, expectedRole?: UserRole | 'acceptor') => Promise<User>;
  loginAsDemo: (role: 'donor' | 'ngo' | 'volunteer' | 'admin') => Promise<User>;
  signup: (data: {
    name: string;
    phone: string;
    email: string;
    role: UserRole | 'acceptor';
    password: string;
    organizationName?: string;
    registrationNumber?: string;
    address?: string;
    city?: string;
    dateOfBirth?: string;
  }) => Promise<{ user: User; sessionExists: boolean }>;
  signInWithGoogle: (intendedRole: 'donor' | 'acceptor' | 'rider') => Promise<void>;
  handleOAuthCallback: () => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  onSessionReset?: () => void;
}

export function AuthProvider({ children, onSessionReset }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const [authError, setAuthError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const onSessionResetRef = useRef(onSessionReset);
  onSessionResetRef.current = onSessionReset;

  const loading = authStatus === 'initializing' || authStatus === 'loading_profile';

  const setUserIfChanged = useCallback((newUser: User | null) => {
    setUser((prev) => {
      if (!prev && !newUser) return null;
      if (!prev || !newUser) return newUser;
      if (
        prev.id === newUser.id &&
        prev.role === newUser.role &&
        prev.isVerified === newUser.isVerified &&
        prev.verificationStatus === newUser.verificationStatus &&
        prev.name === newUser.name &&
        prev.email === newUser.email &&
        prev.updatedAt === newUser.updatedAt
      ) {
        return prev;
      }
      return newUser;
    });
  }, []);

  const loadProfileForSession = useCallback(
    async (session: Session | null, eventReason: string) => {
      const seq = ++requestSeqRef.current;

      if (!session?.user) {
        if (activeUserIdRef.current !== null) {
          clearLegacyAuthCaches();
          onSessionResetRef.current?.();
        }
        activeUserIdRef.current = null;
        if (mountedRef.current) {
          setUser(null);
          setAuthError(null);
          setAuthStatus('unauthenticated');
        }
        return;
      }

      const sessionUserId = session.user.id;
      const isAccountSwitch =
        activeUserIdRef.current !== null && activeUserIdRef.current !== sessionUserId;

      if (isAccountSwitch) {
        // Immediately wipe previous user's state & query cache so wrong role UI never flashes.
        clearLegacyAuthCaches();
        onSessionResetRef.current?.();
        if (mountedRef.current) {
          setUser(null);
          setAuthError(null);
          setAuthStatus('loading_profile');
        }
      } else if (eventReason !== 'TOKEN_REFRESHED') {
        if (mountedRef.current) {
          setAuthError(null);
          setAuthStatus('loading_profile');
        }
      }

      const result = await AuthService.fetchAuthoritativeProfile(sessionUserId);

      // Ignore out-of-order responses from superseded sessions or unmounted provider.
      if (!mountedRef.current || seq !== requestSeqRef.current) {
        return;
      }

      if (result.status === 'ok') {
        activeUserIdRef.current = result.user.id;
        setUserIfChanged(result.user);
        setAuthError(null);
        setAuthStatus('authenticated');
        return;
      }

      activeUserIdRef.current = sessionUserId;
      setUser(null);

      if (result.status === 'missing') {
        setAuthError(
          'Your account profile could not be found. Please retry loading or sign out and contact support.'
        );
        setAuthStatus('profile_missing');
      } else if (result.status === 'invalid_role') {
        setAuthError(
          `Your account role ("${result.rawRole || 'unset'}") is invalid. Please contact support or sign out.`
        );
        setAuthStatus('invalid_role');
      } else {
        setAuthError(result.message);
        setAuthStatus('error');
      }
    },
    [setUserIfChanged]
  );

  const refreshUser = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        if (mountedRef.current) {
          setAuthError(error.message);
          setAuthStatus('error');
        }
        return;
      }
      await loadProfileForSession(session, 'MANUAL_REFRESH');
    } catch (err: any) {
      if (mountedRef.current) {
        setAuthError(err?.message || 'Failed to verify authentication session.');
        setAuthStatus('error');
      }
    }
  }, [loadProfileForSession]);

  const retryAuth = useCallback(async () => {
    setAuthError(null);
    setAuthStatus('loading_profile');
    await refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    mountedRef.current = true;
    clearLegacyAuthCaches();

    let deferredTimer: number | undefined;
    let initialResolved = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      initialResolved = true;

      if (event === 'SIGNED_OUT') {
        ++requestSeqRef.current;
        activeUserIdRef.current = null;
        clearLegacyAuthCaches();
        onSessionResetRef.current?.();
        if (mountedRef.current) {
          setUser(null);
          setAuthError(null);
          setAuthStatus('unauthenticated');
        }
        return;
      }

      // Let login() complete expectedRole validation before updating React auth state.
      if (event === 'SIGNED_IN' && AuthService.isLoginInFlight()) {
        return;
      }

      // Defer async profile query out of Supabase's onAuthStateChange callback to avoid v2 lock contention.
      if (deferredTimer) window.clearTimeout(deferredTimer);
      deferredTimer = window.setTimeout(() => {
        if (mountedRef.current) {
          void loadProfileForSession(session, event);
        }
      }, 0);
    });

    // Safety fallback if INITIAL_SESSION fails to emit promptly.
    const safetyTimer = window.setTimeout(() => {
      if (!initialResolved && mountedRef.current) {
        void refreshUser();
      }
    }, 1500);

    return () => {
      mountedRef.current = false;
      if (deferredTimer) window.clearTimeout(deferredTimer);
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [loadProfileForSession, refreshUser]);

  const login = useCallback(
    async (
      email: string,
      password?: string,
      expectedRole?: UserRole | 'acceptor'
    ): Promise<User> => {
      const loggedInUser = await AuthService.login(email, password, expectedRole);
      ++requestSeqRef.current;

      if (activeUserIdRef.current && activeUserIdRef.current !== loggedInUser.id) {
        onSessionResetRef.current?.();
      }
      activeUserIdRef.current = loggedInUser.id;
      setUserIfChanged(loggedInUser);
      setAuthError(null);
      setAuthStatus('authenticated');
      return loggedInUser;
    },
    [setUserIfChanged]
  );

  const loginAsDemo = useCallback(async (role: 'donor' | 'ngo' | 'volunteer' | 'admin'): Promise<User> => {
    return AuthService.loginAsDemoRole(role);
  }, []);

  const signup = useCallback(
    async (data: {
      name: string;
      phone: string;
      email: string;
      role: UserRole | 'acceptor';
      password: string;
      organizationName?: string;
      registrationNumber?: string;
      address?: string;
      city?: string;
      dateOfBirth?: string;
    }) => {
      const result = await AuthService.signup(data);
      if (result.sessionExists) {
        ++requestSeqRef.current;
        if (activeUserIdRef.current && activeUserIdRef.current !== result.user.id) {
          onSessionResetRef.current?.();
        }
        activeUserIdRef.current = result.user.id;
        setUserIfChanged(result.user);
        setAuthError(null);
        setAuthStatus('authenticated');
      }
      return result;
    },
    [setUserIfChanged]
  );

  const signInWithGoogle = useCallback(async (intendedRole: 'donor' | 'acceptor' | 'rider') => {
    await AuthService.signInWithGoogle(intendedRole);
  }, []);

  const handleOAuthCallback = useCallback(async () => {
    const u = await AuthService.handleOAuthCallback();
    ++requestSeqRef.current;
    if (activeUserIdRef.current && activeUserIdRef.current !== u.id) {
      onSessionResetRef.current?.();
    }
    activeUserIdRef.current = u.id;
    setUserIfChanged(u);
    setAuthError(null);
    setAuthStatus('authenticated');
    return u;
  }, [setUserIfChanged]);

  const logout = useCallback(async () => {
    ++requestSeqRef.current;
    activeUserIdRef.current = null;
    await AuthService.logout();
    setUser(null);
    setAuthError(null);
    setAuthStatus('unauthenticated');
    onSessionResetRef.current?.();
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<User>) => {
      if (!user) return;
      const updated = await AuthService.updateProfile(user.id, updates);
      setUserIfChanged(updated);
    },
    [user, setUserIfChanged]
  );

  const resetPasswordForEmail = useCallback(async (email: string) => {
    await AuthService.resetPasswordForEmail(email);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    await AuthService.updatePassword(password);
  }, []);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      authStatus,
      authError,
      retryAuth,
      login,
      loginAsDemo,
      signup,
      signInWithGoogle,
      handleOAuthCallback,
      logout,
      updateProfile,
      resetPasswordForEmail,
      updatePassword,
      refreshUser,
    }),
    [
      user,
      loading,
      authStatus,
      authError,
      retryAuth,
      login,
      loginAsDemo,
      signup,
      signInWithGoogle,
      handleOAuthCallback,
      logout,
      updateProfile,
      resetPasswordForEmail,
      updatePassword,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
