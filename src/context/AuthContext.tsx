import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  isFirebaseConfigured,
  getFriendlyAuthErrorMessage,
} from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { AuthUser } from '../types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isFirebaseConfigured: boolean;
  signUp: (name: string, email: string, pass: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = 'pdftranslator_local_user';
const LOCAL_STORAGE_USERS_STORE = 'pdftranslator_users_db';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
        if (fbUser) {
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
          });
        } else {
          setUser(null);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      // Offline/Local development fallback
      const saved = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
      if (saved) {
        try {
          setUser(JSON.parse(saved));
        } catch {
          localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
        }
      }
      setLoading(false);
    }
  }, []);

  const signUp = async (name: string, email: string, pass: string) => {
    if (isFirebaseConfigured && auth) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        if (cred.user) {
          await updateProfile(cred.user, { displayName: name });
          setUser({
            uid: cred.user.uid,
            email: cred.user.email,
            displayName: name,
          });
        }
      } catch (err: any) {
        throw new Error(getFriendlyAuthErrorMessage(err.code || err.message));
      }
    } else {
      // Local fallback simulation
      const usersRaw = localStorage.getItem(LOCAL_STORAGE_USERS_STORE) || '[]';
      const users: Array<{ name: string; email: string; pass: string; uid: string }> = JSON.parse(usersRaw);

      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('An account already exists with this email address. Please sign in instead.');
      }

      const newUser = {
        name,
        email,
        pass,
        uid: 'user_' + Math.random().toString(36).substring(2, 11),
      };
      users.push(newUser);
      localStorage.setItem(LOCAL_STORAGE_USERS_STORE, JSON.stringify(users));

      const authUser: AuthUser = {
        uid: newUser.uid,
        email: newUser.email,
        displayName: newUser.name,
      };
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(authUser));
      setUser(authUser);
    }
  };

  const login = async (email: string, pass: string) => {
    if (isFirebaseConfigured && auth) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        if (cred.user) {
          setUser({
            uid: cred.user.uid,
            email: cred.user.email,
            displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
          });
        }
      } catch (err: any) {
        throw new Error(getFriendlyAuthErrorMessage(err.code || err.message));
      }
    } else {
      // Local fallback simulation
      const usersRaw = localStorage.getItem(LOCAL_STORAGE_USERS_STORE) || '[]';
      const users: Array<{ name: string; email: string; pass: string; uid: string }> = JSON.parse(usersRaw);

      const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.pass === pass);
      if (!found) {
        throw new Error('Invalid email or password. Please verify your credentials and try again.');
      }

      const authUser: AuthUser = {
        uid: found.uid,
        email: found.email,
        displayName: found.name,
      };
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(authUser));
      setUser(authUser);
    }
  };

  const logout = async () => {
    if (isFirebaseConfigured && auth) {
      await signOut(auth);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isFirebaseConfigured,
        signUp,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
