import Link from 'next/link';
import { MetricChip, PageHero, SectionHeader, StatusPill, SurfaceCard } from '@/components/system';

const prismCards = [
  {
    title: '知识棱镜',
    subtitle: '把视频拆成知识脉络，而不是零散笔记。',
    description: '实时抓取关键帧、生成知识板、沉淀闪卡与大纲，适合课程、分享、访谈和长视频学习。',
    accent: 'var(--prism-amber)',
    points: ['实时看板', '关键帧洞察', '思维导图', '学习卡片'],
  },
  {
    title: '创作棱镜',
    subtitle: '把灵感推进成分镜工程，而不是一次性生成。',
    description: '导演对话、章节推演、节点画布和渲染任务都在同一条创作链里，支持分支与回滚。',
    accent: 'var(--prism-pink)',
    points: ['导演对话', '节点画布', '人物锚点', '成片导出'],
  },
  {
    title: '翻译棱镜',
    subtitle: '把译制流程压缩为一条可控流水线。',
    description: '字幕、音色、修复、导出四步串联，保留任务状态和编辑能力，而不是多个工具来回切换。',
    accent: 'var(--prism-cyan)',
    points: ['字幕对齐', '音色克隆', '视频修复', '多格式导出'],
  },
  {
    title: '衍射棱镜',
    subtitle: '把一条视频裂变成多平台资产包。',
    description: '按平台语境生成图文与分发素材，素材挑选、草稿预览和导出动作在同一界面完成。',
    accent: 'var(--prism-indigo)',
    points: ['平台策略', '素材篮', '文案草稿', '批量导出'],
  },
];

const workflow = [
  {
    step: '01',
    title: '导入一条视频',
    description: '从本地上传或粘贴链接开始，系统围绕同一份视频上下文建立后续所有工作。',
  },
  {
    step: '02',
    title: '切换不同棱镜',
    description: '不用换系统，只需要切换右侧 Prism Studio，就能在学习、创作、译制、分发之间流转。',
  },
  {
    step: '03',
    title: '沉淀并导出资产',
    description: '产出笔记、视频、译制片、图文包，并保留项目状态，方便继续迭代。',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-text-primary">
      <header className="sticky top-0 z-40 border-b border-stroke-default bg-[color:color-mix(in_srgb,var(--bg-base)_82%,transparent)] backdrop-blur-xl">
        <div className="page-width flex h-18 items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
            <PrismMark />
            <span>Viewpoint Prism</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-text-secondary md:flex">
            <a href="#prisms" className="hover:text-text-primary">四大棱镜</a>
            <a href="#workflow" className="hover:text-text-primary">工作流</a>
            <a href="#workspace" className="hover:text-text-primary">工作台</a>
            <a href="#byok" className="hover:text-text-primary">开放架构</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="prism-btn-secondary px-4 py-2 text-sm">登录</Link>
            <Link href="/register" className="prism-btn-primary px-5 py-2 text-sm">开始使用</Link>
          </div>
        </div>
      </header>

      <PageHero
        eyebrow="Narrative Workspace for Video"
        title={<><span>一束视频，</span><br /><span className="prism-gradient-text">折射四条产线</span></>}
        description={<>一个工作台，把同一条视频并行处理为学习资产、创作分镜、多语种译制和多平台图文，不切换工具，不拆散上下文。</>}
        actions={
          <>
            <Link href="/register" className="prism-btn-primary">免费开始</Link>
            <Link href="/projects" className="prism-btn-secondary">进入项目中枢</Link>
          </>
        }
        meta={
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricChip label="棱镜产线" value="4" hint="学习、创作、翻译、衍射统一挂载到同一工作台。" />
            <MetricChip label="工作入口" value="1" hint="视频导入、分析、编辑、导出全部在同一产品内完成。" />
            <MetricChip label="模型策略" value="BYOK" hint="模型供应商可替换，工作流保持一致。" />
          </div>
        }
        visual={<HeroVisual />}
      />

      <section id="prisms" className="page-shell page-section">
        <div className="page-width">
          <SectionHeader
            eyebrow="Four Prisms"
            title="不是四个孤立页面，而是四条连续产线"
            description="每个棱镜都有自己的语义和辅色，但整体保持同一套空间、层级和交互语言。"
            align="center"
            className="items-center"
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {prismCards.map((card) => (
              <SurfaceCard key={card.title} className="p-6 md:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Prism Module</div>
                    <h3 className="mt-3 text-2xl font-semibold text-text-primary">{card.title}</h3>
                    <p className="mt-2 text-sm font-medium" style={{ color: card.accent }}>{card.subtitle}</p>
                    <p className="mt-4 text-sm leading-7 text-text-secondary">{card.description}</p>
                  </div>
                  <span className="mt-1 h-3 w-3 rounded-full" style={{ background: card.accent, boxShadow: `0 0 0 8px color-mix(in srgb, ${card.accent} 16%, transparent)` }} />
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {card.points.map((point) => (
                    <StatusPill key={point}>{point}</StatusPill>
                  ))}
                </div>
              </SurfaceCard>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="page-shell page-section">
        <div className="page-width">
          <SectionHeader
            eyebrow="Workflow"
            title="从视频到资产，流程是连续的"
            description="首页不是单纯列功能，而是直接说明产品的时间顺序和工作方式。"
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {workflow.map((item) => (
              <SurfaceCard key={item.step} className="p-6">
                <div className="text-sm font-semibold text-[var(--accent-primary)]">{item.step}</div>
                <h3 className="mt-4 text-xl font-semibold text-text-primary">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-text-secondary">{item.description}</p>
              </SurfaceCard>
            ))}
          </div>
        </div>
      </section>

      <section id="workspace" className="page-shell page-section">
        <div className="page-width grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <SurfaceCard className="p-7">
            <SectionHeader
              eyebrow="Workspace"
              title="工作台不是黑盒，而是可导航的生产界面"
              description="左侧管理视频源，中间处理播放与对话，右侧挂载 Prism Studio。不同棱镜共享同一骨架，降低切换成本。"
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <StatusPill tone="warning">三栏工作台</StatusPill>
              <StatusPill tone="info">Prism Studio</StatusPill>
              <StatusPill>统一状态条</StatusPill>
            </div>
          </SurfaceCard>
          <SurfaceCard className="overflow-hidden p-3">
            <img src="/showcase/workbench-overview.png" alt="Viewpoint Prism 工作台概览" className="rounded-[22px] border border-stroke-default" />
          </SurfaceCard>
        </div>
      </section>

      <section className="page-shell page-section">
        <div className="page-width grid gap-6 xl:grid-cols-2">
          <SurfaceCard className="overflow-hidden p-3">
            <img src="/showcase/creation-prism.png" alt="创作棱镜界面" className="rounded-[22px] border border-stroke-default" />
          </SurfaceCard>
          <SurfaceCard className="overflow-hidden p-3">
            <img src="/showcase/knowledge-prism.png" alt="知识棱镜界面" className="rounded-[22px] border border-stroke-default" />
          </SurfaceCard>
        </div>
      </section>

      <section id="byok" className="page-shell page-section pb-20">
        <div className="page-width">
          <SurfaceCard className="grid gap-6 p-7 xl:grid-cols-[1fr_420px] xl:items-center">
            <div>
              <SectionHeader
                eyebrow="Open Architecture"
                title="BYOK 不是口号，而是产品结构的一部分"
                description="模型只负责能力，Viewpoint Prism 负责状态、流程和编辑权。你可以切换套餐，也可以在设置工作区里覆盖自己的 API Key。"
              />
              <div className="mt-6 flex flex-wrap gap-2">
                {['OpenAI', 'Gemini', 'Whisper', 'Midjourney', 'Seedance', 'ElevenLabs'].map((item) => (
                  <StatusPill key={item}>{item}</StatusPill>
                ))}
              </div>
            </div>
            <SurfaceCard className="p-5" tone="muted">
              <p className="text-[11px] uppercase tracking-[0.22em] text-text-muted">Engine Status</p>
              <div className="mt-5 space-y-4">
                {[
                  ['ASR', 'Whisper / Seedance', 'success'],
                  ['LLM', 'OpenAI / Gemini', 'success'],
                  ['Image', 'OpenAI / Midjourney', 'warning'],
                  ['Video', 'Seedance', 'warning'],
                ].map(([label, provider, tone]) => (
                  <div key={label} className="flex items-center justify-between rounded-[18px] border border-stroke-default bg-bg-panel-secondary/75 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-text-primary">{label}</div>
                      <div className="mt-1 text-xs text-text-secondary">{provider}</div>
                    </div>
                    <StatusPill tone={tone as 'success' | 'warning'}>{tone === 'success' ? 'Ready' : 'Hybrid'}</StatusPill>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </SurfaceCard>
        </div>
      </section>
    </div>
  );
}

function PrismMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 2L26 24H2L14 2Z" stroke="url(#mark-gradient)" strokeWidth="2" />
      <path d="M14 8L20 19H8L14 8Z" fill="url(#mark-gradient)" opacity="0.2" />
      <defs>
        <linearGradient id="mark-gradient" x1="2" y1="2" x2="26" y2="24">
          <stop offset="0%" stopColor="var(--prism-orange)" />
          <stop offset="52%" stopColor="var(--prism-pink)" />
          <stop offset="100%" stopColor="var(--prism-indigo)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function HeroVisual() {
  return (
    <SurfaceCard className="overflow-hidden p-4 md:p-5">
      <div className="relative rounded-[28px] border border-stroke-default bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent-strong)_18%,transparent),transparent_38%),radial-gradient(circle_at_right,color-mix(in_srgb,var(--accent-primary)_18%,transparent),transparent_35%),var(--bg-surface-alt)] p-6">
        <div className="absolute inset-x-6 top-6 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--text-secondary)_40%,transparent),transparent)]" />
        <div className="mx-auto mt-8 flex max-w-[430px] flex-col items-center text-center">
          <StatusPill tone="success">BYOK 架构 · 统一工作流</StatusPill>
          <div className="mt-8 text-4xl font-semibold leading-[1.05] text-text-primary md:text-5xl">
            从输入视频，到<span className="prism-gradient-text">四种产出</span>
          </div>
          <p className="mt-4 text-sm leading-7 text-text-secondary">首屏保留品牌记忆点，但优先说明产品价值和工作逻辑。</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {['视频理解', '创作工程', '多语译制', '图文分发'].map((item, index) => (
            <div key={item} className="rounded-[20px] border border-stroke-default bg-bg-panel/65 px-4 py-4 text-sm text-text-secondary">
              <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">0{index + 1}</div>
              <div className="mt-2 font-medium text-text-primary">{item}</div>
            </div>
          ))}
        </div>
      </div>
    </SurfaceCard>
  );
}
