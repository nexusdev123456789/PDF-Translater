import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { SignUpPage } from './components/SignUpPage';
import { TranslatePage } from './components/TranslatePage';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<'login' | 'signup'>('login');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">Initializing PDF Translator...</p>
        </div>
      </div>
    );
  }

  // Translate page is only accessible when logged in; otherwise show Login or SignUp
  if (user) {
    return <TranslatePage />;
  }

  if (currentPage === 'signup') {
    return <SignUpPage onNavigateToLogin={() => setCurrentPage('login')} />;
  }

  return <LoginPage onNavigateToSignUp={() => setCurrentPage('signup')} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
