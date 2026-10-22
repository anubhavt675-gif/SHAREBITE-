import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthService } from '../services/auth';
import type { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password?: string, expectedRole?: UserRole | 'acceptor') => Promise<void>;
  loginAsDemo: (role: 'donor' | 'ngo' | 'volunteer' | 'admin') => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const currentUser = await AuthService.getCurrentUser();
    setUser(currentUser);
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));

    const { data: { subscription } } = AuthService.onAuthStateChange(async (newUser) => {
      setUser(newUser);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [refreshUser]);

  const login = async (email: string, password?: string, expectedRole?: UserRole | 'acceptor') => {
    const loggedInUser = await AuthService.login(email, password, expectedRole);
    setUser(loggedInUser);
  };

  const loginAsDemo = async (role: 'donor' | 'ngo' | 'volunteer' | 'admin') => {
    const loggedInUser = AuthService.loginAsDemoRole(role);
    setUser(loggedInUser);
  };

  const signup = async (data: {
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
    if (result.sessionExists) setUser(result.user);
    return result;
  };

  const signInWithGoogle = async (intendedRole: 'donor' | 'acceptor' | 'rider') => {
    await AuthService.signInWithGoogle(intendedRole);
    await refreshUser();
  };

  const handleOAuthCallback = async () => {
    const u = await AuthService.handleOAuthCallback();
    setUser(u);
    return u;
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    const updated = await AuthService.updateProfile(user.id, updates);
    setUser(updated);
  };

  const resetPasswordForEmail = async (email: string) => {
    await AuthService.resetPasswordForEmail(email);
  };

  const updatePassword = async (password: string) => {
    await AuthService.updatePassword(password);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
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
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
