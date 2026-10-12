import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword as fbCreateUser,
  signInWithEmailAndPassword as fbSignIn,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  onAuthStateChanged as fbOnAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
  firebaseConfig.projectId
);

let app: any = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  } catch {
    // Graceful fallback to local auth if config is invalid
  }
}

export const auth = authInstance;

// Helper to format friendly error messages
export function getFriendlyAuthErrorMessage(errorCodeOrMessage: string): string {
  if (errorCodeOrMessage.includes('auth/invalid-credential') || errorCodeOrMessage.includes('auth/wrong-password')) {
    return 'Invalid email or password. Please verify your credentials and try again.';
  }
  if (errorCodeOrMessage.includes('auth/user-not-found')) {
    return 'No account found with this email. Please check your email or sign up.';
  }
  if (errorCodeOrMessage.includes('auth/email-already-in-use')) {
    return 'An account already exists with this email address. Please sign in instead.';
  }
  if (errorCodeOrMessage.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (errorCodeOrMessage.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (errorCodeOrMessage.includes('auth/too-many-requests')) {
    return 'Too many failed login attempts. Please wait a few moments and try again.';
  }
  if (errorCodeOrMessage.includes('auth/network-request-failed')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  return errorCodeOrMessage || 'An unexpected authentication error occurred.';
}
