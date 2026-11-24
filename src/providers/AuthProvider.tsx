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
import type { Locale } from '@/types/locale';
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
  /** Best-effort mirror of the device locale choice to the profile endpoint. */
  syncPreferredLanguage: (locale: Locale) => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let authTokenProviderRegistered = false;

/**
 * Register before the first render so same-tick API requests can read the
 * current Firebase ID token. The provider reads Firebase's currentUser at call
 * time; no token or user object is captured here.
 */
function registerAuthTokenProviderOnce(): void {
  if (authTokenProviderRegistered) return;
  setAuthTokenProvider(async () => {
    if (!env.isFirebaseConfigured) return null;
    try {
      const { auth } = getFirebase();
      const user = auth.currentUser;
      if (!user) return null;
      return await user.getIdToken();
    } catch (error) {
      if (__DEV__)
        console.warn('[auth] tokenProvider:getIdToken-failed', {
          code: (error as { code?: string })?.code,
        });
      return null;
    }
  });
  authTokenProviderRegistered = true;
}

registerAuthTokenProviderOnce();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(env.isFirebaseConfigured ? 'loading' : 'unauthenticated');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const userRef = useRef<User | null>(null);
  const authActionInProgressRef = useRef(false);

  const loadProfile = useCallback(async (user: User): Promise<UserProfile> => {
    const { firestore } = getFirebase();
    if (__DEV__) console.info('[auth] loadProfile:start', { uid: user.uid });
    const tokenResult = await user.getIdTokenResult(true);
    const claimRole = parseRole(tokenResult.claims.role);
    const reference = doc(firestore, 'users', user.uid);
    const snapshot = await getDoc(reference);
    const raw = snapshot.data();
    const stored = parseUserProfile(raw);
    if (__DEV__)
      console.info('[auth] loadProfile:doc', {
        uid: user.uid,
        exists: snapshot.exists(),
        parsed: Boolean(stored),
        claimRole: claimRole ?? null,
      });

    if (stored) {
      const resolvedRole = claimRole ?? stored.role;
      const resolved: UserProfile = {
        ...stored,
        role: resolvedRole,
        isVerified: stored.isVerified || resolvedRole === 'admin',
      };
      setProfile(resolved);
      return resolved;
    }

    // If a profile doc exists but is malformed/incomplete, do not overwrite protected
    // fields (role/isVerified/createdAt) because Firestore rules reject that.
    if (snapshot.exists() && raw && typeof raw === 'object') {
      const data = raw as Record<string, unknown>;
      const resolvedRole = claimRole ?? parseRole(data.role) ?? 'farmer';
      const resolved: UserProfile = {
        uid: typeof data.uid === 'string' && data.uid ? data.uid : user.uid,
        email: typeof data.email === 'string' || data.email === null ? (data.email as string | null) : (user.email ?? null),
        displayName:
          typeof data.displayName === 'string' && data.displayName.trim()
            ? data.displayName
            : (user.displayName ?? user.email?.split('@')[0] ?? ''),
        role: resolvedRole,
        isVerified: data.isVerified === true || resolvedRole === 'admin',
        ...(typeof data.phoneNumber === 'string' && data.phoneNumber ? { phoneNumber: data.phoneNumber } : {}),
        ...(typeof data.district === 'string' && data.district ? { district: data.district } : {}),
        ...(data.preferredLanguage === 'bn' || data.preferredLanguage === 'en'
          ? { preferredLanguage: data.preferredLanguage }
          : {}),
      };
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

    try {
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
      if (__DEV__) console.info('[auth] loadProfile:created-fallback', { uid: user.uid, role: fallbackRole });
    } catch (error) {
      if (__DEV__)
        console.warn('[auth] loadProfile:create-fallback-error', {
          uid: user.uid,
          code: (error as { code?: string })?.code,
        });
      throw error;
    }

    setProfile(created);
    return created;
  }, []);

  const failAuthentication = useCallback(async () => {
    try {
      await signOutUser();
    } catch {
      // The local session is still cleared even if Firebase cannot be reached.
    }
    userRef.current = null;
    setFirebaseUser(null);
    setProfile(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    if (!env.isFirebaseConfigured) return;

    const { auth } = getFirebase();
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      userRef.current = user;
      setFirebaseUser(user);

      // signIn/signUp/logout finish the state transition themselves. Handling
      // the intermediate Firebase event here can write a fallback profile
      // before registration has stored the selected role.
      if (authActionInProgressRef.current) return;

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
        .catch((error) => {
          if (!active) return;
          if (__DEV__)
            console.warn('[auth] onAuthStateChanged:profile-load-failed', {
              uid: user.uid,
              code: (error as { code?: string })?.code,
            });
          // Never leave an authenticated user without a role: the route guards
          // would bounce between the dashboard and /login.
          void failAuthentication();
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [failAuthentication, loadProfile]);

  // Token provider is registered synchronously during render so React Query
  // hooks that mount on the same auth transition already have a token source.

  const wrap = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    setErrorCode(null);
    return operation().catch((error: unknown) => {
      setErrorCode(toAuthErrorCode(error));
      throw error;
    });
  }, []);

  const runAuthAction = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      authActionInProgressRef.current = true;
      return wrap(operation).finally(() => {
        authActionInProgressRef.current = false;
      });
    },
    [wrap],
  );

  const signIn = useCallback(
    async (values: LoginValues) => {
      return runAuthAction(async () => {
        const user = await signInWithFirebase(values.email, values.password);
        userRef.current = user;
        setFirebaseUser(user);
        try {
          const resolved = await loadProfile(user);
          setProfile(resolved);
          setStatus('authenticated');
          return resolved;
        } catch (error) {
          if (__DEV__)
            console.warn('[auth] signIn:post-auth-failed', {
              uid: user.uid,
              code: (error as { code?: string })?.code,
            });
          await failAuthentication();
          throw error;
        }
      });
    },
    [failAuthentication, loadProfile, runAuthAction],
  );

  const signUp = useCallback(
    async (values: RegisterValues) => {
      return runAuthAction(async () => {
        const user = await registerWithFirebase(values);
        userRef.current = user;
        setFirebaseUser(user);
        try {
          const resolved = await loadProfile(user);
          setProfile(resolved);
          setStatus('authenticated');
          return resolved;
        } catch (error) {
          if (__DEV__)
            console.warn('[auth] signUp:post-auth-failed', {
              uid: user.uid,
              code: (error as { code?: string })?.code,
            });
          await failAuthentication();
          throw error;
        }
      });
    },
    [failAuthentication, loadProfile, runAuthAction],
  );

  const resetPassword = useCallback(
    async (values: ForgotPasswordValues) => wrap(() => sendPasswordReset(values.email)),
    [wrap],
  );

  const logout = useCallback(async () => {
    await runAuthAction(async () => {
      await signOutUser();
      userRef.current = null;
      setFirebaseUser(null);
      setProfile(null);
      setStatus('unauthenticated');
    });
  }, [runAuthAction]);

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

  const syncPreferredLanguage = useCallback(async (locale: Locale) => {
    const user = userRef.current;
    if (!user || !env.isApiConfigured) return;

    try {
      const remote = await patchMyProfile({ preferredLanguage: locale });
      setProfile(remote);
    } catch {
      // A failed server mirror must never undo or crash the local choice.
      // The device persists the selection independently in the locale store.
    }
  }, []);

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
      syncPreferredLanguage,
      clearError: () => setErrorCode(null),
    }),
    [
      status,
      firebaseUser,
      profile,
      errorCode,
      signIn,
      signUp,
      resetPassword,
      logout,
      refreshProfile,
      updateProfile,
      syncPreferredLanguage,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
