'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-white text-lg">載入中...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">PNA</span>
            </div>
            <span className="text-white font-semibold text-lg">Dashboard</span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-400">登入身份</p>
              <p className="text-white font-medium">{session.user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-6 py-2 bg-transparent border-2 border-cyan-400 text-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-slate-900 transition-all font-medium"
            >
              登出
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Welcome Section */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 shadow-xl mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">
              歡迎回來！
            </h1>
            <p className="text-gray-300 text-lg">
              您已成功登入 Project Network Analysis 系統
            </p>
          </div>

          {/* User Info Card */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30 shadow-xl mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">帳號資訊</h2>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">
                    {session.user?.email?.[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-400">電子郵件</p>
                  <p className="text-white text-lg font-medium">{session.user?.email}</p>
                </div>
              </div>
              {session.user?.name && (
                <div className="border-t border-gray-700 pt-4">
                  <p className="text-sm text-gray-400">名稱</p>
                  <p className="text-white text-lg font-medium">{session.user.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Placeholder for Future Features */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30 shadow-xl">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">專案分析</h3>
              <p className="text-gray-400 text-sm">即將推出</p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30 shadow-xl">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">隨機環境</h3>
              <p className="text-gray-400 text-sm">即將推出</p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30 shadow-xl">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">精確分析</h3>
              <p className="text-gray-400 text-sm">即將推出</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}