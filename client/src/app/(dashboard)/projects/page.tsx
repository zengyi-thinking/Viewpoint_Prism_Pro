'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState, MetricChip, SectionHeader, StatusPill, SurfaceCard } from '@/components/system';
import { ThemeSelector } from '@/components/theme';
import { getToken, removeToken } from '@/services/api';
import { projectApi, type Project } from '@/services/project.api';

const templates = [
  { title: '空白工程', description: '从一条视频开始，自定义选择棱镜与处理路径。', badge: 'Blank' },
  { title: '学习拆解', description: '优先进入知识棱镜，适合课程、直播回放和长视频学习。', badge: 'Knowledge' },
  { title: '内容二创', description: '优先进入创作棱镜，适合短视频重构和镜头级再创作。', badge: 'Creation' },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('空白工程');

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await projectApi.list();
      setProjects(data);
    } catch (error) {
      setProjects([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : '当前无法连接后端服务，请确认接口可用后重试。',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    void fetchProjects();
  }, [fetchProjects, router]);

  const projectMetrics = useMemo(() => {
    const totalVideos = projects.reduce((sum, project) => sum + (project._count?.videos ?? 0), 0);
    return {
      totalProjects: String(projects.length),
      totalVideos: String(totalVideos),
      recentProject: projects[0]?.name || '等待新工程',
    };
  }, [projects]);

  return (
    <div className="min-h-screen text-text-primary">
      <header className="sticky top-0 z-40 border-b border-stroke-default bg-[color:color-mix(in_srgb,var(--bg-base)_84%,transparent)] backdrop-blur-xl">
        <div className="page-width flex h-18 items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
            <PrismLogo />
            <span>Viewpoint Prism</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSelector />
            <Link href="/settings" className="rounded-full border border-stroke-default px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary">
              设置工作区
            </Link>
            <button onClick={() => { removeToken(); router.push('/login'); }} className="rounded-full border border-stroke-default px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary">
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell py-8">
        <div className="page-width space-y-8">
          <SurfaceCard className="grid gap-8 p-7 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <SectionHeader
                eyebrow="Projects Hub"
                title="把工程管理做成一个真正的中枢"
                description="这里不是简单的卡片列表，而是进入工作台之前的启动层。你可以查看最近工程、选择模板、切换主题和继续上次的生产状态。"
              />
              <div className="mt-7 flex flex-wrap gap-3">
                <Button variant="accent" size="lg" onClick={() => setShowCreate(true)}>新建工程</Button>
                <Link href="/settings" className="prism-btn-secondary">配置 AI 提供商</Link>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <MetricChip label="工程总数" value={projectMetrics.totalProjects} hint="当前账号下可继续迭代的项目数量。" />
              <MetricChip label="视频资产" value={projectMetrics.totalVideos} hint="累计绑定到工程中的视频数量。" />
              <MetricChip label="最近工程" value={projectMetrics.recentProject} hint="继续回到工作台处理未完成内容。" className="sm:col-span-3 xl:col-span-1" />
            </div>
          </SurfaceCard>

          <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
            <SurfaceCard className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Templates</div>
                  <h2 className="mt-2 text-2xl font-semibold">启动模板</h2>
                </div>
                <StatusPill tone="info">{selectedTemplate}</StatusPill>
              </div>
              <div className="mt-6 space-y-3">
                {templates.map((template) => (
                  <button
                    key={template.title}
                    type="button"
                    onClick={() => setSelectedTemplate(template.title)}
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      selectedTemplate === template.title
                        ? 'border-[color:var(--accent-primary)] bg-[color:var(--accent-soft)]'
                        : 'border-stroke-default bg-bg-panel-secondary/60 hover:border-stroke-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-text-primary">{template.title}</div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">{template.description}</p>
                      </div>
                      <StatusPill>{template.badge}</StatusPill>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-6 rounded-[22px] border border-stroke-default bg-bg-panel-secondary/60 p-4">
                <div className="text-sm font-semibold text-text-primary">默认建议</div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">如果你还没有明确方向，先用“空白工程”进入工作台，再通过右侧 Prism Studio 切换不同棱镜。</p>
              </div>
            </SurfaceCard>

            <SurfaceCard className="overflow-hidden p-3">
              <img src="/showcase/projects-hub.png" alt="项目中枢预览" className="rounded-[22px] border border-stroke-default" />
            </SurfaceCard>
          </div>

          <section>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Recent Projects</div>
                <h2 className="mt-2 text-2xl font-semibold text-text-primary">最近工程</h2>
              </div>
              <div className="flex gap-3">
                {loadError ? <Button variant="outline" onClick={() => void fetchProjects()}>重试连接</Button> : null}
                <Button variant="outline" onClick={() => setShowCreate(true)}>创建新工程</Button>
              </div>
            </div>

            {loading ? (
              <SurfaceCard className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-stroke-default border-t-[var(--accent-primary)]" />
              </SurfaceCard>
            ) : loadError ? (
              <EmptyState
                title="当前无法连接后端服务"
                description={`${loadError} 你仍然可以继续切换主题或查看设置，但项目数据需要等后端恢复后才能读取。`}
                icon={<PrismLogo />}
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="accent" onClick={() => void fetchProjects()}>重新连接</Button>
                    <Link href="/settings" className="prism-btn-secondary">查看设置工作区</Link>
                  </div>
                }
              />
            ) : projects.length === 0 ? (
              <EmptyState
                title="还没有工程"
                description="先创建一个工程，把你的第一条视频带入同一个工作台，再决定是做学习拆解、创作、翻译还是多平台分发。"
                icon={<PrismLogo />}
                action={<Button variant="accent" onClick={() => setShowCreate(true)}>创建第一个工程</Button>}
              />
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} onDelete={fetchProjects} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {showCreate ? (
        <CreateProjectModal
          selectedTemplate={selectedTemplate}
          onClose={() => setShowCreate(false)}
          onCreated={(project) => {
            setShowCreate(false);
            router.push(`/project/${project.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm('确定删除该工程？此操作不可恢复。')) return;
    setDeleting(true);
    try {
      await projectApi.delete(project.id);
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const videoCount = project._count?.videos ?? 0;
  const createdAt = new Date(project.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  return (
    <SurfaceCard className="cursor-pointer overflow-hidden p-0" tone="muted">
      <div role="button" tabIndex={0} onClick={() => router.push(`/project/${project.id}`)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          router.push(`/project/${project.id}`);
        }
      }} className="w-full text-left">
        <div className="bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent-strong)_14%,transparent),transparent_40%),radial-gradient(circle_at_right,color-mix(in_srgb,var(--accent-primary)_14%,transparent),transparent_35%),var(--bg-surface-alt)] p-5">
          <div className="flex items-start justify-between gap-3">
            <PrismLogo />
            <StatusPill>{videoCount} 视频</StatusPill>
          </div>
          <h3 className="mt-8 text-xl font-semibold text-text-primary">{project.name}</h3>
          <p className="mt-3 line-clamp-2 min-h-[3rem] text-sm leading-6 text-text-secondary">{project.description || '尚未填写项目描述。'}</p>
        </div>
        <div className="flex items-center justify-between border-t border-stroke-default px-5 py-4">
          <div>
            <div className="text-xs text-text-muted">创建于</div>
            <div className="mt-1 text-sm text-text-secondary">{createdAt}</div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-full border border-stroke-default px-3 py-2 text-xs text-text-secondary transition hover:text-[var(--signal-error)]"
          >
            {deleting ? '删除中' : '删除'}
          </button>
        </div>
      </div>
    </SurfaceCard>
  );
}

function CreateProjectModal({ onClose, onCreated, selectedTemplate }: { onClose: () => void; onCreated: (project: Project) => void; selectedTemplate: string; }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const suggestions = {
    空白工程: '例如：品牌发布会视频总控',
    学习拆解: '例如：AI 课程知识拆解',
    内容二创: '例如：短视频剧情再创作',
  } as const;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const project = await projectApi.create({ name: name.trim(), description: description.trim() || undefined });
      onCreated(project);
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : '创建失败，请稍后重试');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
        <SurfaceCard className="p-0">
          <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-stroke-default p-6 md:border-b-0 md:border-r">
            <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Launch Panel</div>
            <h2 className="mt-3 text-3xl font-semibold text-text-primary">新建工程</h2>
            <p className="mt-4 text-sm leading-7 text-text-secondary">用统一的启动面板进入工作台。模板只是推荐，不会锁定后续流程。</p>
            <div className="mt-6 rounded-[22px] border border-stroke-default bg-bg-panel-secondary/65 p-4">
              <div className="text-sm font-semibold text-text-primary">当前模板</div>
              <div className="mt-2 text-lg text-text-primary">{selectedTemplate}</div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">创建后你依然可以在工作台里自由切换四个棱镜。</p>
            </div>
          </div>
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="project-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">工程名称</label>
                <input id="project-name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} className="input" placeholder={suggestions[selectedTemplate as keyof typeof suggestions] || '输入工程名称'} />
              </div>
              <div>
                <label htmlFor="project-description" className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">工程说明</label>
                <textarea id="project-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="input resize-none" placeholder="说明这个工程的目标、素材来源、预期产出。" />
              </div>
              {error ? <div className="rounded-[18px] border border-[color:var(--signal-error)]/25 bg-[color:var(--signal-error)]/10 px-4 py-3 text-sm text-[color:var(--signal-error)]">{error}</div> : null}
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
                  <Button type="submit" variant="accent" disabled={loading || !name.trim()}>{loading ? '创建中...' : '创建并进入工作台'}</Button>
                </div>
              </form>
              </div>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function PrismLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 2L26 24H2L14 2Z" stroke="url(#projects-logo)" strokeWidth="2" />
      <defs>
        <linearGradient id="projects-logo" x1="2" y1="2" x2="26" y2="24">
          <stop offset="0%" stopColor="var(--prism-orange)" />
          <stop offset="50%" stopColor="var(--prism-pink)" />
          <stop offset="100%" stopColor="var(--prism-indigo)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
