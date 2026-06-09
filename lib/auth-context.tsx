import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { apiRequest, queryClient, getQueryFn } from '@/lib/query-client';

interface AuthUser {
  id: string;
  email: string;
  primaryRole: 'driver' | 'creator';
  displayName: string;
  bio: string | null;
  profileImage: string | null;
  carInfo: string | null;
  mediaTypes: string | null;
  location: string | null;
  socialLinks: string | null;
  travelAvailable: boolean | null;
  onboardingComplete: boolean | null;
  isDriverEnabled: boolean | null;
  isCreatorEnabled: boolean | null;
  driverBio: string | null;
  creatorBio: string | null;
  cars: string | null;
  createdAt: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; displayName: string; primaryRole: 'driver' | 'creator' }) => Promise<void>;
  logout: () => Promise<void>;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, refetch } = useQuery<AuthUser | null>({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: 5 * 60 * 1000, // 5 minutes — keeps the UI in sync if account state changes server-side
  });

  const [wasAuthenticated, setWasAuthenticated] = useState(false);

  useEffect(() => {
    if (user) {
      setWasAuthenticated(true);
    } else if (wasAuthenticated && !isLoading) {
      setWasAuthenticated(false);
      queryClient.clear();
      router.replace('/(auth)/login');
    }
  }, [user, isLoading, wasAuthenticated]);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest('POST', '/api/auth/login', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; displayName: string; primaryRole: string }) => {
      const res = await apiRequest('POST', '/api/auth/register', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/auth/logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.clear();
    },
  });

  const value = useMemo(() => ({
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login: async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    register: async (data: { email: string; password: string; displayName: string; primaryRole: 'driver' | 'creator' }) => {
      await registerMutation.mutateAsync(data);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    refetchUser: () => refetch(),
  }), [user, isLoading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
