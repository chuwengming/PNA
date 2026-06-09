'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleGetStarted = () => {
    // 檢查登入狀態
    if (status === 'authenticated') {
      // 已登入：導向 dashboard
      router.push('/dashboard');
    } else {
      // 未登入：導向 login
      router.push('/login');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-blue-500/20">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <div className="relative w-24 h-10">
              <Image
                src="/logo.jpeg"
                alt="PNA Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </a>

          {/* Menu Items */}
          <div className="hidden md:flex items-center space-x-8">
            <button className="text-gray-300 hover:text-white transition-colors font-medium">
              Explore
            </button>
            <Link href="/docs" className="text-gray-300 hover:text-white transition-colors font-medium">
              Q &amp; A
            </Link>
            <button className="text-gray-300 hover:text-white transition-colors font-medium">
              Contact
            </button>
          </div>

          {/* Sign In Button - 根據登入狀態顯示不同內容 */}
          {status === 'authenticated' ? (
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2 bg-transparent border-2 border-cyan-400 text-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-slate-900 transition-all font-medium"
            >
              Dashboard
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-2 bg-transparent border-2 border-cyan-400 text-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-slate-900 transition-all font-medium"
            >
              Sign In
            </button>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 pt-32 pb-20">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
                Project Network
              </h1>
              <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight mt-2">
                Analysis
              </h1>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Network Construction</h3>
                  <p className="text-gray-400">Construct and analyze the DAC network structure</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Stochastic Environment</h3>
                  <p className="text-gray-400">Handle uncertainty with robust stochastic modeling</p>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">Precise Analysis</h3>
                  <p className="text-gray-400">Deliver accurate results with Label Correction Tracing Algorithms</p>
                </div>
              </div>
            </div>

            {/* Get Started Button - 添加點擊處理和載入狀態 */}
            <button 
              onClick={handleGetStarted}
              disabled={status === 'loading'}
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 transition-all font-semibold text-lg shadow-lg shadow-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/60 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {status === 'loading' ? 'Loading...' : 'Get Started'}
            </button>
          </div>

          {/* Right Image */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl blur-3xl opacity-20"></div>
            <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-blue-500/30">
              <img 
                src="/network-visualization.png" 
                alt="Project Network Visualization" 
                className="w-full h-auto rounded-lg"
                onError={(e) => {
                  // Fallback if image doesn't exist
                  e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400"%3E%3Crect fill="%23334155" width="500" height="400"/%3E%3Cg opacity="0.3"%3E%3Ccircle cx="100" cy="100" r="40" fill="%2306b6d4" /%3E%3Ccircle cx="250" cy="150" r="60" fill="%2306b6d4" /%3E%3Ccircle cx="400" cy="100" r="40" fill="%2306b6d4" /%3E%3Ccircle cx="150" cy="250" r="45" fill="%2306b6d4" /%3E%3Ccircle cx="350" cy="280" r="50" fill="%2306b6d4" /%3E%3Cline x1="100" y1="100" x2="250" y2="150" stroke="%2306b6d4" stroke-width="2"/%3E%3Cline x1="250" y1="150" x2="400" y2="100" stroke="%2306b6d4" stroke-width="2"/%3E%3Cline x1="100" y1="100" x2="150" y2="250" stroke="%2306b6d4" stroke-width="2"/%3E%3Cline x1="250" y1="150" x2="150" y2="250" stroke="%2306b6d4" stroke-width="2"/%3E%3Cline x1="250" y1="150" x2="350" y2="280" stroke="%2306b6d4" stroke-width="2"/%3E%3Cline x1="400" y1="100" x2="350" y2="280" stroke="%2306b6d4" stroke-width="2"/%3E%3C/g%3E%3C/svg%3E';
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Background decorative elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>
    </main>
  );
}