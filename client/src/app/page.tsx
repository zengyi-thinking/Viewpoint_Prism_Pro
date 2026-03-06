export default function LandingPage() {
  return (
    <div
      className="min-h-screen w-full bg-[#0a0a0f] text-[#e8e8ed]"
      style={{
        writingMode: 'horizontal-tb',
        textOrientation: 'mixed',
        minWidth: '100vw',
      }}
    >
      {/* ====== Navbar ====== */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <PrismLogo />
            <span className="text-lg font-semibold tracking-tight">Viewpoint Prism</span>
          </div>
          <div className="hidden items-center gap-8 text-sm text-white/50 md:flex">
            <a href="#features" className="transition hover:text-white/90">功能</a>
            <a href="#workflow" className="transition hover:text-white/90">工作流</a>
            <a href="#byok" className="transition hover:text-white/90">开放架构</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="rounded-lg px-4 py-2 text-sm text-white/60 transition hover:text-white hover:bg-white/5">
              登录
            </a>
            <a href="/register" className="prism-btn-primary !rounded-lg !px-5 !py-2 !text-sm">
              开始使用
            </a>
          </div>
        </div>
      </nav>

      {/* ====== Hero Section ====== */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16">
        {/* 背景光晕 */}
        <div className="hero-glow hero-glow-orange" />
        <div className="hero-glow hero-glow-pink" />
        <div className="hero-glow hero-glow-indigo" />

        {/* 棱镜装饰 */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <PrismDecoration />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[56rem] text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/60">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
            BYOK 架构 · 自带模型密钥
          </div>

          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight break-normal md:text-7xl">
            <span className="block">一束视频，</span>
            <span className="block prism-gradient-text">四道光谱</span>
          </h1>

          <p className="mx-auto mb-10 max-w-[42rem] text-lg leading-relaxed text-white/50 break-normal md:text-xl">
            同一条视频通过四大棱镜，折射为学习笔记、二创视频、多语种译制、多平台图文。
            不切换工具，不重复劳动，一个工作台完成全部内容生产。
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href="/register" className="prism-btn-primary">
              免费开始
            </a>
            <button className="prism-btn-secondary" disabled>
              查看演示
            </button>
          </div>
        </div>

        {/* 底部渐隐 */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0f] to-transparent" />
      </section>

{/* PLACEHOLDER_FEATURES */}

      {/* ====== Features: 四大棱镜 ====== */}
      <section id="features" className="relative px-6 py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-prism-pink">Core Prisms</p>
            <h2 className="mb-4 text-3xl font-bold md:text-5xl">四大棱镜，四条产线</h2>
            <p className="mx-auto max-w-[36rem] text-white/40">
              不切换系统，切换棱镜即切换产线。每个棱镜都输出可导出的高价值资产。
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 知识棱镜 */}
            <div className="prism-card group p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">知识棱镜</h3>
              <p className="mb-4 text-sm leading-relaxed text-white/40">
                视频播放中实时抓取 PPT、白板、图表关键帧，自动生成结构化大纲。
                对话框提问即时注入笔记时间轴，一键导出 Markdown + 闪卡 + Notion 同步。
              </p>
              <div className="flex flex-wrap gap-2">
                <Tag>实时逐字稿</Tag>
                <Tag>关键帧捕获</Tag>
                <Tag>记忆闪卡</Tag>
                <Tag>Notion 同步</Tag>
              </div>
            </div>

            {/* 创作棱镜 */}
            <div className="prism-card group p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500/20 to-rose-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E91E8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12h8" /><path d="M12 8v8" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">创作棱镜 · PrismFlow</h3>
              <p className="mb-4 text-sm leading-relaxed text-white/40">
                类 Git 节点化视频工程。文案自动拆解分镜，每个节点独立控制首尾帧与动态补全，
                不满意就拉分支重渲染，最终一键串联导出成片。
              </p>
              <div className="flex flex-wrap gap-2">
                <Tag>节点画布</Tag>
                <Tag>Branch / Merge</Tag>
                <Tag>首尾帧锚定</Tag>
                <Tag>风格预设</Tag>
              </div>
            </div>

            {/* 译制棱镜 */}
            <div className="prism-card group p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
                  <path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">译制棱镜</h3>
              <p className="mb-4 text-sm leading-relaxed text-white/40">
                双语字幕精准对照，画面硬字幕智能擦除重贴，
                克隆原作者音色生成外语配音。一条视频，多语种同步产出。
              </p>
              <div className="flex flex-wrap gap-2">
                <Tag>双语字幕</Tag>
                <Tag>文字擦除</Tag>
                <Tag>音色克隆</Tag>
                <Tag>口型同步</Tag>
              </div>
            </div>

            {/* 衍射棱镜 */}
            <div className="prism-card group p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12h8" /><path d="M4 18V6" />
                  <path d="M16 6l4 6-4 6" /><path d="M12 6l4 6-4 6" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">衍射棱镜</h3>
              <p className="mb-4 text-sm leading-relaxed text-white/40">
                视频内容降维裂变为多平台图文。小红书种草文、Twitter Thread、公众号长文，
                AI 自动适配平台语境与排版，一键批量导出。
              </p>
              <div className="flex flex-wrap gap-2">
                <Tag>小红书</Tag>
                <Tag>Twitter/X</Tag>
                <Tag>公众号</Tag>
                <Tag>LinkedIn</Tag>
              </div>
            </div>
          </div>
        </div>
      </section>

{/* PLACEHOLDER_WORKFLOW */}

      {/* ====== How It Works ====== */}
      <section id="workflow" className="relative px-6 py-32">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-prism-orange">Workflow</p>
            <h2 className="mb-4 text-3xl font-bold md:text-5xl">三步，从视频到资产</h2>
          </div>

          <div className="flex flex-col items-center gap-8 md:flex-row md:justify-center md:gap-0">
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center md:w-64">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-bold prism-gradient-text">
                1
              </div>
              <h3 className="mb-2 text-lg font-semibold">导入视频</h3>
              <p className="text-sm text-white/40">上传本地文件或粘贴 YouTube / B站链接，视频自动入库</p>
            </div>

            <div className="step-connector hidden md:block" />

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center md:w-64">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-bold prism-gradient-text">
                2
              </div>
              <h3 className="mb-2 text-lg font-semibold">选择棱镜</h3>
              <p className="text-sm text-white/40">点击右侧棱镜图标，面板展开为专用控制台，AI 自动开始工作</p>
            </div>

            <div className="step-connector hidden md:block" />

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center md:w-64">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-bold prism-gradient-text">
                3
              </div>
              <h3 className="mb-2 text-lg font-semibold">获得资产</h3>
              <p className="text-sm text-white/40">笔记、视频、译制片、图文包——可导出、可同步、可复用</p>
            </div>
          </div>
        </div>
      </section>

      {/* ====== BYOK Section ====== */}
      <section id="byok" className="relative px-6 py-32">
        <div className="mx-auto max-w-5xl">
          <div className="prism-card overflow-hidden p-10 md:p-16">
            <div className="flex flex-col gap-10 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="mb-3 text-sm font-medium uppercase tracking-widest text-prism-indigo">Open Architecture</p>
                <h2 className="mb-4 text-3xl font-bold md:text-4xl">BYOK · 自带密钥</h2>
                <p className="mb-6 leading-relaxed text-white/40">
                  不绑定任何单一模型供应商。你在 Setting 中填入自己的 API Key，
                  系统按任务类型智能路由——ASR 用 Whisper，推理用 GPT-4o，
                  生图用 Midjourney，生视频用 Seedance。丰俭由人，完全掌控。
                </p>
                <div className="flex flex-wrap gap-3">
                  <ModelBadge name="OpenAI" />
                  <ModelBadge name="Gemini" />
                  <ModelBadge name="Whisper" />
                  <ModelBadge name="Midjourney" />
                  <ModelBadge name="Seedance" />
                  <ModelBadge name="ElevenLabs" />
                </div>
              </div>
              <div className="flex-shrink-0">
                <EngineStatusDemo />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== Footer ====== */}
      <footer className="border-t border-white/5 px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <PrismLogo />
            <span className="text-sm font-medium text-white/40">Viewpoint Prism Pro</span>
          </div>
          <p className="text-sm text-white/30">
            一个工作台，四种生产模式
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ====== 内联组件 ====== */

function PrismLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="prism-grad" x1="0" y1="0" x2="28" y2="28">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="50%" stopColor="#E91E8C" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <path d="M14 2L26 24H2L14 2Z" stroke="url(#prism-grad)" strokeWidth="2" fill="none" />
      <path d="M14 8L20 20H8L14 8Z" fill="url(#prism-grad)" opacity="0.2" />
    </svg>
  );
}

function PrismDecoration() {
  return (
    <svg width="500" height="400" viewBox="0 0 500 400" fill="none" className="opacity-20">
      <line x1="0" y1="200" x2="200" y2="200" stroke="white" strokeWidth="1.5" opacity="0.4" />
      <path d="M200 120L300 280H100L200 120Z" stroke="url(#deco-grad)" strokeWidth="1.5" fill="none" />
      <line x1="270" y1="170" x2="500" y2="80" stroke="#FF6B35" strokeWidth="1.5" opacity="0.6" />
      <line x1="280" y1="190" x2="500" y2="150" stroke="#F59E0B" strokeWidth="1.5" opacity="0.5" />
      <line x1="285" y1="210" x2="500" y2="210" stroke="#10B981" strokeWidth="1.5" opacity="0.5" />
      <line x1="280" y1="230" x2="500" y2="270" stroke="#06B6D4" strokeWidth="1.5" opacity="0.5" />
      <line x1="270" y1="250" x2="500" y2="340" stroke="#4F46E5" strokeWidth="1.5" opacity="0.6" />
      <defs>
        <linearGradient id="deco-grad" x1="100" y1="280" x2="300" y2="120">
          <stop offset="0%" stopColor="#FF6B35" />
          <stop offset="50%" stopColor="#E91E8C" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/50">
      {children}
    </span>
  );
}

function ModelBadge({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60">
      {name}
    </span>
  );
}

function EngineStatusDemo() {
  const engines = [
    { name: "ASR 引擎", provider: "Whisper v3", status: "green" },
    { name: "语言模型", provider: "GPT-4o", status: "green" },
    { name: "生图引擎", provider: "Midjourney", status: "green" },
    { name: "生视频", provider: "Seedance 2.0", status: "yellow" },
    { name: "TTS", provider: "ElevenLabs", status: "green" },
  ];

  const statusColor: Record<string, string> = {
    green: "bg-green-400",
    yellow: "bg-yellow-400",
    red: "bg-red-400",
  };

  return (
    <div className="w-64 rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-white/30">引擎状态</p>
      <div className="flex flex-col gap-2.5">
        {engines.map((e) => (
          <div key={e.name} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/70">{e.name}</p>
              <p className="text-[10px] text-white/30">{e.provider}</p>
            </div>
            <span className={`h-2 w-2 rounded-full ${statusColor[e.status]}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
