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
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="28" y2="28">
                  <stop offset="0%" stopColor="#FF6B35" />
                  <stop offset="50%" stopColor="#E91E8C" />
                  <stop offset="100%" stopColor="#4F46E5" />
                </linearGradient>
              </defs>
              <path d="M14 2L26 24H2L14 2Z" stroke="url(#lg)" strokeWidth="2" fill="none" />
              <path d="M14 8L20 20H8L14 8Z" fill="url(#lg)" opacity="0.2" />
            </svg>
            <span className="text-xl font-semibold text-white">Viewpoint Prism</span>
          </Link>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
          <h1 className="mb-2 text-2xl font-bold text-white">欢迎回来</h1>
          <p className="mb-8 text-sm text-white/40">登录你的账户继续工作</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm text-white/60">邮箱</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition focus:border-white/25 focus:ring-1 focus:ring-white/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm text-white/60">密码</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition focus:border-white/25 focus:ring-1 focus:ring-white/10"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/30">
            还没有账户？{' '}
            <Link href="/register" className="text-white/60 underline transition hover:text-white">
              注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
