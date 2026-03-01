'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/services/auth.api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.login(email, password);
      router.push('/projects');
    } catch (err: any) {
      setError(err.message || '登录失败，请检查邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0f] px-4">
      {/* 背景光晕 */}
      <div className="auth-glow auth-glow-orange" />
      <div className="auth-glow auth-glow-pink" />
      <div className="auth-glow auth-glow-indigo" />

      {/* 棱镜装饰 */}
      <div className="absolute right-0 top-0 h-96 w-96 opacity-10">
        <svg width="100%" height="100%" viewBox="0 0 400 400" fill="none">
          <defs>
            <linearGradient id="auth-deco" x1="0" y1="0" x2="400" y2="400">
              <stop offset="0%" stopColor="#FF6B35" stopOpacity="0.5" />
              <stop offset="50%" stopColor="#E91E8C" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path d="M200 50L350 350H50L200 50Z" stroke="url(#auth-deco)" strokeWidth="1.5" fill="none" />
          <path d="M200 120L280 280H120L200 120Z" stroke="url(#auth-deco)" strokeWidth="1" fill="none" opacity="0.5" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="relative">
              <svg width="36" height="36" viewBox="0 0 28 28" fill="none" className="transition-transform group-hover:scale-110">
                <defs>
                  <linearGradient id="auth-logo" x1="0" y1="0" x2="28" y2="28">
                    <stop offset="0%" stopColor="#FF6B35" />
                    <stop offset="50%" stopColor="#E91E8C" />
                    <stop offset="100%" stopColor="#4F46E5" />
                  </linearGradient>
                </defs>
                <path d="M14 2L26 24H2L14 2Z" stroke="url(#auth-logo)" strokeWidth="2" fill="none" />
                <path d="M14 8L20 20H8L14 8Z" fill="url(#auth-logo)" opacity="0.2" />
              </svg>
              <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-[#FF6B35]/20 to-[#E91E8C]/20 blur-xl group-hover:from-[#FF6B35]/30 group-hover:to-[#E91E8C]/30 transition-all" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Viewpoint Prism</span>
          </Link>
          <p className="mt-3 text-sm text-white/30">视频内容工作台</p>
        </div>

        {/* Card */}
        <div className="prism-card overflow-hidden !p-0">
          <div className="p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">欢迎回来</h1>
              <p className="mt-2 text-sm text-white/40">登录你的账户继续创作</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-white/50">
                  邮箱地址
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pl-10 text-sm text-white placeholder-white/20 outline-none transition-all focus:border-[#E91E8C]/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-[#E91E8C]/20"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-white/50">
                  密码
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pl-10 text-sm text-white placeholder-white/20 outline-none transition-all focus:border-[#E91E8C]/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-[#E91E8C]/20"
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5">
                  <svg className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 w-full overflow-hidden rounded-lg bg-gradient-to-r from-[#FF6B35] via-[#E91E8C] to-[#4F46E5] py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                <span className="relative z-10">{loading ? '登录中...' : '登录'}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-[#FF6B35] via-[#E91E8C] to-[#4F46E5] opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </form>
          </div>

          <div className="border-t border-white/5 px-8 py-4 text-center">
            <p className="text-sm text-white/30">
              还没有账户？{' '}
              <Link href="/register" className="font-medium text-white/60 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-white/40">
                立即注册
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
