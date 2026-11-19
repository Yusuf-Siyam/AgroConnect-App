import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { env } from '@/config/env';
import {
  register as registerWithFirebase,
  sendPasswordReset,
  signIn as signInWithFirebase,
  signOutUser,
  toAuthErrorCode,
  type AuthErrorCode,
} from '@/features/authentication/authService';
import { parseRole, parseUserProfile } from '@/features/authentication/profile';
import type { ForgotPasswordValues, LoginValues, RegisterValues } from '@/features/authentication/schemas';
import { patchMyProfile, setAuthTokenProvider, type ProfileUpdate } from '@/services/api';
import { getFirebase } from '@/services/firebase';
import type { Role, UserProfile } from '@/types/user';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  firebaseUser: User | null;
  profile: UserProfile | null;
  role: Role | null;
  errorCode: AuthErrorCode | null;
  isConfigured: boolean;
  signIn: (values: LoginValues) => Promise<UserProfile>;
  signUp: (values: RegisterValues) => Promise<UserProfile>;
  resetPassword: (values: ForgotPasswordValues) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  updateProfile: (values: ProfileUpdate) => Promise<UserProfile>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(env.isFirebaseConfigured ? 'loading' : 'unauthenticated');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const userRef = useRef<User | null>(null);

  const loadProfile = useCallback(async (user: User): Promise<UserProfile> => {
    const { firestore } = getFirebase();
    const tokenResult = await user.getIdTokenResult(true);
    const claimRole = parseRole(tokenResult.claims.role);
    const reference = doc(firestore, 'users', user.uid);
    const snapshot = await getDoc(reference);
    const stored = parseUserProfile(snapshot.data());

    if (stored) {
      const resolvedRole = claimRole ?? stored.role;
      const resolved: UserProfile = { ...stored, role: resolvedRole, isVerified: stored.isVerified || resolvedRole === 'admin' };
      setProfile(resolved);
      return resolved;
    }

    // Admin profiles must already exist because the Admin SDK writes them.
    if (claimRole === 'admin') {
      const adminProfile: UserProfile = {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? user.email?.split('@')[0] ?? '',
        role: 'admin',
        isVerified: true,
      };
      setProfile(adminProfile);
      return adminProfile;
    }

    const fallbackRole = claimRole ?? 'farmer';
    const created: UserProfile = {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? user.email?.split('@')[0] ?? '',
      role: fallbackRole,
      isVerified: false,
    };

    await setDoc(
      reference,
      {
        uid: created.uid,
        email: created.email,
        displayName: created.displayName,
        role: created.role,
        isVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    setProfile(created);
    return created;
  }, []);

  useEffect(() => {
    if (!env.isFirebaseConfigured) return;

    const { auth } = getFirebase();
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      userRef.current = user;
      setFirebaseUser(user);

      if (!user) {
        setProfile(null);
        setStatus('unauthenticated');
        return;
      }

      void loadProfile(user)
        .then((resolved) => {
          if (!active) return;
          setProfile(resolved);
          setStatus('authenticated');
        })
        .catch(() => {
          if (!active) return;
          // Authentication succeeded but the profile could not be read.
          setProfile(null);
          setStatus('authenticated');
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      const user = userRef.current;
      return user ? user.getIdToken() : null;
    });

    return () => setAuthTokenProvider(async () => null);
  }, []);

  const wrap = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    setErrorCode(null);
    return operation().catch((error: unknown) => {
      setErrorCode(toAuthErrorCode(error));
      throw error;
    });
  }, []);

  const signIn = useCallback(
    async (values: LoginValues) => {
      return wrap(async () => {
        const user = await signInWithFirebase(values.email, values.password);
        userRef.current = user;
        setFirebaseUser(user);
        const resolved = await loadProfile(user);
        setProfile(resolved);
        setStatus('authenticated');
        return resolved;
      });
    },
    [loadProfile, wrap],
  );

  const signUp = useCallback(
    async (values: RegisterValues) => {
      return wrap(async () => {
        const user = await registerWithFirebase(values);
        userRef.current = user;
        setFirebaseUser(user);
        const resolved = await loadProfile(user);
        setProfile(resolved);
        setStatus('authenticated');
        return resolved;
      });
    },
    [loadProfile, wrap],
  );

  const resetPassword = useCallback(
    async (values: ForgotPasswordValues) => wrap(() => sendPasswordReset(values.email)),
    [wrap],
  );

  const logout = useCallback(async () => {
    await wrap(() => signOutUser());
    userRef.current = null;
    setFirebaseUser(null);
    setProfile(null);
    setStatus('unauthenticated');
  }, [wrap]);

  const refreshProfile = useCallback(async () => {
    const user = userRef.current;
    if (!user) return null;
    const resolved = await loadProfile(user);
    setProfile(resolved);
    return resolved;
  }, [loadProfile]);

  const updateProfile = useCallback(
    async (values: ProfileUpdate) => {
      return wrap(async () => {
        const user = userRef.current;
        if (!user) throw new Error('No authenticated user');

        if (env.isApiConfigured) {
          const remote = await patchMyProfile(values);
          setProfile(remote);
          return remote;
        }

        const { firestore } = getFirebase();
        await updateDoc(doc(firestore, 'users', user.uid), {
          ...values,
          updatedAt: serverTimestamp(),
        });
        const refreshed = await loadProfile(user);
        setProfile(refreshed);
        return refreshed;
      });
    },
    [loadProfile, wrap],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUser,
      profile,
      role: profile?.role ?? null,
      errorCode,
      isConfigured: env.isFirebaseConfigured,
      signIn,
      signUp,
      resetPassword,
      logout,
      refreshProfile,
      updateProfile,
      clearError: () => setErrorCode(null),
    }),
    [status, firebaseUser, profile, errorCode, signIn, signUp, resetPassword, logout, refreshProfile, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
