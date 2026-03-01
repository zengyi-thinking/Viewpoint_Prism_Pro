'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { projectApi, Project } from '@/services/project.api';
import { getToken, removeToken } from '@/services/api';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await projectApi.list();
      setProjects(data);
    } catch {
      // auth error handled by api layer
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchProjects();
  }, [router, fetchProjects]);

  const handleLogout = () => {
    removeToken();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative">
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none" className="transition-transform group-hover:scale-110">
                <defs>
                  <linearGradient id="nav-logo" x1="0" y1="0" x2="28" y2="28">
                    <stop offset="0%" stopColor="#FF6B35" />
                    <stop offset="50%" stopColor="#E91E8C" />
                    <stop offset="100%" stopColor="#4F46E5" />
                  </linearGradient>
                </defs>
                <path d="M14 2L26 24H2L14 2Z" stroke="url(#nav-logo)" strokeWidth="2" fill="none" />
                <path d="M14 8L20 20H8L14 8Z" fill="url(#nav-logo)" opacity="0.2" />
              </svg>
              <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-[#FF6B35]/20 to-[#E91E8C]/20 blur-lg group-hover:from-[#FF6B35]/30 group-hover:to-[#E91E8C]/30 transition-all" />
            </div>
            <span className="text-base font-semibold text-white">Viewpoint Prism</span>
          </Link>

          <div className="flex items-center gap-5">
            <Link href="/settings" className="flex items-center gap-1.5 text-sm text-white/40 transition hover:text-white/70">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 01-1.85-1.85l-.15-.08a2 2 0 00-.73-.73 2 2 0 00-1.73 1V7a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 01-1.85-1.85l-.15-.08a2 2 0 00-.73-.73A2 2 0 002 7V5a2 2 0 012-2h.18a2 2 0 001.73-1l.25-.43a2 2 0 010-2l-.08-.15a2 2 0 00.73-2.73l.38-.22a2 2 0 011.85-1.85l.08-.15a2 2 0 00.73-.73 2 2 0 00-1 1.73V4a2 2 0 002 2h.18a2 2 0 001.73-1l.25-.43a2 2 0 010-2l-.08-.15a2 2 0 00.73-2.73l.38-.22a2 2 0 011.85-1.85l.08-.15a2 2 0 00.73-.73zM12 15a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
              设置
            </Link>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-white/40 transition hover:text-white/70">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">我的工程</h1>
            <p className="mt-2 text-sm text-white/30">管理你的视频内容创作工程</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90"
          >
            <svg className="h-4 w-4 transition-transform group-hover:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新建工程
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/5 border-t-white/50" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={fetchProjects} />
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(p) => {
            setShowCreate(false);
            router.push(`/project/${p.id}`);
          }}
        />
      )}
    </div>
  );
}

/* ====== Sub Components ====== */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 py-24">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent" />

      <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <svg width="36" height="36" viewBox="0 0 28 28" fill="none" className="opacity-30">
          <path d="M14 2L26 24H2L14 2Z" stroke="white" strokeWidth="1.5" />
          <path d="M14 8L20 20H8L14 8Z" fill="white" opacity="0.2" />
        </svg>
      </div>
      <p className="relative mb-2 text-base font-medium text-white/50">还没有工程</p>
      <p className="relative mb-8 text-sm text-white/25">创建你的第一个视频内容工程</p>
      <button
        onClick={onCreate}
        className="relative group overflow-hidden rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 transition-all hover:bg-white/10"
      >
        <span className="relative z-10 flex items-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          创建工程
        </span>
      </button>
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除该工程？此操作不可恢复。')) return;
    setDeleting(true);
    try {
      await projectApi.delete(project.id);
      onDelete();
    } catch {
      setDeleting(false);
    }
  };

  const videoCount = project._count?.videos ?? 0;
  const date = new Date(project.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      onClick={() => router.push(`/project/${project.id}`)}
      className="group relative prism-card !p-0 overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
    >
      {/* Cover with gradient overlay */}
      <div className="relative h-36 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FF6B35]/10 via-[#E91E8C]/10 to-[#4F46E5]/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent" />

        {/* Prism icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-20 group-hover:opacity-30 transition-opacity">
          <svg width="64" height="64" viewBox="0 0 28 28" fill="none">
            <path d="M14 2L26 24H2L14 2Z" stroke="white" strokeWidth="1" fill="none" />
            <path d="M14 8L20 20H8L14 8Z" fill="white" opacity="0.15" />
          </svg>
        </div>

        {/* Video count badge */}
        {videoCount > 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-sm">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {videoCount}
          </div>
        )}
      </div>

      <div className="p-5">
        <h3 className="mb-2 truncate text-base font-semibold text-white group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-[#FF6B35] group-hover:to-[#E91E8C] group-hover:bg-clip-text group-hover:text-transparent transition-all">
          {project.name}
        </h3>
        {project.description && (
          <p className="mb-4 line-clamp-2 text-xs text-white/30 leading-relaxed">{project.description}</p>
        )}

        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <span className="text-[10px] text-white/20">{date}</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded p-1.5 text-white/20 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            aria-label="删除工程"
          >
            {deleting ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-16.22" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const project = await projectApi.create({ name: name.trim(), description: description.trim() || undefined });
      onCreated(project);
    } catch (err: any) {
      setError(err.message || '创建失败，请稍后重试');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d0d14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient line */}
        <div className="h-1 w-full bg-gradient-to-r from-[#FF6B35] via-[#E91E8C] to-[#4F46E5]" />

        <div className="p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">新建工程</h2>
            <p className="mt-2 text-sm text-white/30">创建一个新的视频内容工程</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="space-y-1.5">
              <label htmlFor="proj-name" className="block text-xs font-medium uppercase tracking-wider text-white/50">
                工程名称 <span className="text-red-400">*</span>
              </label>
              <input
                id="proj-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：产品发布会视频分析"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all focus:border-[#E91E8C]/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-[#E91E8C]/20"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="proj-desc" className="block text-xs font-medium uppercase tracking-wider text-white/50">
                描述 <span className="text-white/30">(可选)</span>
              </label>
              <textarea
                id="proj-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简单描述这个工程的用途..."
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all focus:border-[#E91E8C]/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-[#E91E8C]/20"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5">
                <svg className="h-4 w-4 text-red-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-white/50 transition hover:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="group relative overflow-hidden rounded-lg bg-gradient-to-r from-[#FF6B35] via-[#E91E8C] to-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.219-16.22" />
                      </svg>
                      创建中...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5v14" />
                      </svg>
                      创建工程
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
