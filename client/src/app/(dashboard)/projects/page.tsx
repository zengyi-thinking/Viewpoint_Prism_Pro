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
      <header className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="28" y2="28">
                  <stop offset="0%" stopColor="#FF6B35" />
                  <stop offset="50%" stopColor="#E91E8C" />
                  <stop offset="100%" stopColor="#4F46E5" />
                </linearGradient>
              </defs>
              <path d="M14 2L26 24H2L14 2Z" stroke="url(#lg)" strokeWidth="2" fill="none" />
            </svg>
            <span className="text-base font-semibold text-white">Viewpoint Prism</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-sm text-white/40 transition hover:text-white/70">
              设置
            </Link>
            <button onClick={handleLogout} className="text-sm text-white/40 transition hover:text-white/70">
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">我的工程</h1>
            <p className="mt-1 text-sm text-white/30">选择一个工程开始工作，或创建新工程</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            + 新建工程
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-24">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity="0.3">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <p className="mb-1 text-sm font-medium text-white/50">还没有工程</p>
      <p className="mb-6 text-xs text-white/25">创建你的第一个视频内容工程</p>
      <button
        onClick={onCreate}
        className="rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/70 transition hover:bg-white/10"
      >
        创建工程
      </button>
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除该工程？')) return;
    setDeleting(true);
    try {
      await projectApi.delete(project.id);
      onDelete();
    } catch {
      setDeleting(false);
    }
  };

  const videoCount = project._count?.videos ?? 0;
  const date = new Date(project.createdAt).toLocaleDateString('zh-CN');

  return (
    <div
      onClick={() => router.push(`/project/${project.id}`)}
      className="group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition hover:border-white/15 hover:bg-white/[0.05]"
    >
      {/* Cover placeholder */}
      <div className="mb-4 flex h-28 items-center justify-center rounded-lg bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
        <svg width="32" height="32" viewBox="0 0 28 28" fill="none" opacity="0.15">
          <path d="M14 2L26 24H2L14 2Z" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>

      <h3 className="mb-1 truncate text-sm font-semibold text-white/90">{project.name}</h3>
      {project.description && (
        <p className="mb-3 line-clamp-2 text-xs text-white/30">{project.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-white/20">
          <span>{videoCount} 个视频</span>
          <span>{date}</span>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded p-1 text-white/20 opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
          aria-label="删除工程"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
        </button>
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
      setError(err.message || '创建失败');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12121a] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-6 text-xl font-bold text-white">新建工程</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="proj-name" className="mb-1.5 block text-sm text-white/60">工程名称</label>
            <input
              id="proj-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品发布会视频分析"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition focus:border-white/25"
            />
          </div>

          <div>
            <label htmlFor="proj-desc" className="mb-1.5 block text-sm text-white/60">描述 (可选)</label>
            <textarea
              id="proj-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述这个工程的用途..."
              className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition focus:border-white/25"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
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
              className="rounded-lg bg-gradient-to-r from-[#FF6B35] to-[#E91E8C] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建工程'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
