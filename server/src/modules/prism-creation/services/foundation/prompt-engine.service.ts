import { Injectable } from '@nestjs/common';

type PromptBundle = {
  scriptSegment: string;
  videoPrompt: string;
  sceneFramePrompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
};

type PromptContext = {
  idea: string;
  current?: {
    scriptSegment?: string;
    prompt?: string;
    orderIndex?: number;
  } | null;
  payload?: Record<string, any> | null;
  tone?: string;
};

@Injectable()
export class PromptEngineService {
  private readonly negativePrompt = [
    '避免主体漂移',
    '避免人物换脸',
    '避免肢体畸形',
    '避免服装突变',
    '避免背景突然切换',
    '避免镜头抖动失控',
    '避免低清晰度',
    '避免多余人物抢焦点',
    '避免文字水印',
  ].join('，');

  normalizeBundle(context: PromptContext): PromptBundle {
    const payload = context.payload || {};
    const idea = String(context.idea || '').trim();
    const current = context.current || null;
    const continuity = this.buildContinuityAnchors(current, idea);
    const toneGuide = this.describeTone(context.tone || 'cinematic');

    const fallbackScriptSegment = current
      ? `镜头推进：延续上一镜头的主体与空间关系，在保持人物服装、场景基调、情绪氛围一致的前提下，推动剧情进入“${idea}”的下一拍。`
      : `故事开场：以“${idea}”建立世界观、人物状态与核心悬念，让第一镜头既能交代场景，又能自然埋下后续推进的钩子。`;

    const scriptSegment = String(payload.scriptSegment || fallbackScriptSegment).trim();
    const subjectLine = this.pickBest(
      payload.subject,
      this.extractSubject(scriptSegment, current?.scriptSegment, current?.prompt),
      current?.scriptSegment,
      current?.prompt,
      idea,
    );
    const settingLine = this.pickBest(
      payload.setting,
      this.extractSetting(scriptSegment, current?.prompt, idea),
      '空间真实可拍，环境信息明确，景别层次清楚',
    );
    const actionLine = this.pickBest(
      payload.action,
      this.extractAction(scriptSegment, idea),
      '主体动作清晰可见，动作起承转合明确，节奏连续自然',
    );
    const cameraLine = this.pickBest(
      payload.camera,
      this.extractCamera(payload.videoPrompt || payload.prompt || scriptSegment),
      current ? '镜头延续上一镜头的视线方向与景别逻辑，缓慢推进并跟随主体动作' : '中景起势，镜头缓慢推进到近景，建立主体与空间关系',
    );
    const lightingLine = this.pickBest(
      payload.lighting,
      this.extractLighting(payload.videoPrompt || payload.prompt || scriptSegment),
      current ? '保持上一镜头主色温与明暗关系一致，补充局部高光和氛围光' : '电影级布光，主光、辅光、轮廓光明确，色彩层次自然',
    );
    const styleLine = this.pickBest(
      payload.style,
      toneGuide,
      '写实电影感，细节清晰，材质可信，镜头语言专业',
    );

    const sceneFramePrompt = String(
      payload.sceneFramePrompt ||
        this.formatDisplayPrompt([
          ['主体与角色', subjectLine],
          ['场景与环境', settingLine],
          ['动作与姿态', actionLine],
          ['镜头与构图', this.toStillCamera(cameraLine)],
          ['光线与色彩', lightingLine],
          ['风格与质感', styleLine],
          ['连续性锚点', continuity],
          ['负面约束', this.negativePrompt],
        ]),
    ).trim();

    const firstFramePrompt = String(
      payload.firstFramePrompt ||
        this.formatDisplayPrompt([
          ['镜头职责', current ? '承接上一节点尾帧，作为当前镜头的起始锚点' : '作为整段故事的开场锚点，负责稳定建立人物、空间与情绪'],
          ['主体与角色', subjectLine],
          ['场景与环境', settingLine],
          ['起始动作', current ? `延续上一镜头结果，主体从稳定姿态进入本镜头，准备执行：${actionLine}` : `主体以最有辨识度的开场状态进入画面，准备开始：${actionLine}`],
          ['镜头与构图', this.toOpeningCamera(cameraLine)],
          ['光线与色彩', lightingLine],
          ['连续性锚点', continuity],
          ['负面约束', this.negativePrompt],
        ]),
    ).trim();

    const lastFramePrompt = String(
      payload.lastFramePrompt ||
        this.formatDisplayPrompt([
          ['镜头职责', current ? '作为当前镜头结束锚点，为下一个镜头提供可承接的稳定终态' : '作为开场镜头的落点，完成第一拍并留下剧情钩子'],
          ['主体与角色', subjectLine],
          ['场景与环境', settingLine],
          ['结束状态', this.toEndingAction(actionLine)],
          ['镜头与构图', this.toEndingCamera(cameraLine)],
          ['光线与色彩', lightingLine],
          ['连续性锚点', continuity],
          ['负面约束', this.negativePrompt],
        ]),
    ).trim();

    const videoPrompt = String(
      payload.videoPrompt || payload.prompt ||
        this.buildVideoPromptParagraph({
          subjectLine,
          settingLine,
          actionLine,
          cameraLine,
          lightingLine,
          styleLine,
          continuity,
          current,
          idea,
        }),
    ).trim();

    return {
      scriptSegment,
      videoPrompt,
      sceneFramePrompt,
      firstFramePrompt,
      lastFramePrompt,
    };
  }

  buildMultishotSystemPrompt(mode: 'next_node' | 'preview' | 'candidates' | 'script_split' | 'refine', tone?: string) {
    const toneLine = tone ? `当前整体调性偏好：${this.describeTone(tone)}` : '';
    const common = [
      '你是专业的视频分镜导演与提示词工程师。',
      '目标是为即梦 / Seedance 一类图像与视频模型生成稳定、高质量、可连续衔接的提示词。',
      '提示词必须同时覆盖：主体身份、外观、场景环境、动作变化、镜头语言、构图、光线色彩、情绪氛围、连续性锚点、质量约束。',
      '视频提示词必须遵循时间顺序，描述从开始到结束的镜头变化，不能只是堆关键词。',
      '如果存在上一镜头，必须显式继承人物、服装、场景、色调、视线方向、镜头节奏中的关键锚点，避免风格跳变。',
      '画面提示词适合生成单帧，视频提示词适合生成首尾帧之间的运动过程。',
      '不要输出 markdown 代码块。',
      toneLine,
    ].filter(Boolean).join('\n');

    if (mode === 'script_split') {
      return [
        common,
        '请将长文案拆成多个镜头节点。每个节点都要有 segment、prompt、estimatedDuration。',
        'prompt 要写成专业的单帧画面提示词，不是对白复述。',
        '相邻节点要有明显的镜头推进关系，不能只是句子平均切块。',
      ].join('\n');
    }

    if (mode === 'preview') {
      return [
        common,
        '请先输出故事预览，不要直接替用户创建节点。',
        '每个方向都必须体现不同的开场策略与推进路径，不能只是同一故事换几个近义词。',
        '至少覆盖以下差异维度中的 3 个：开场信息量、人物登场方式、冲突触发点、镜头视角、空间规模、情绪节奏。',
        '三个方向必须分别落在不同的开场法上，例如：世界观建立型、人物钩子型、事件闯入型、悬念冷开型、情绪浸入型。',
        '如果多个方向的标题、开场场景或推进节点价值相似，视为不合格。',
        '必须返回 title, openingScene, progressionBeat, styleNotes, confirmationChecklist, scriptSegment, videoPrompt, sceneFramePrompt, firstFramePrompt, lastFramePrompt。',
      ].join('\n');
    }

    if (mode === 'candidates') {
      return [
        common,
        '请基于当前节点生成多个下一个节点候选。',
        '每个候选都必须体现不同的调度、情绪推进、镜头策略，而不是只改几个词。',
        '必须返回 scriptSegment, videoPrompt, sceneFramePrompt, firstFramePrompt, lastFramePrompt。',
      ].join('\n');
    }

    if (mode === 'refine') {
      return [
        common,
        '请根据用户调整要求，重写当前节点的文案与整套提示词。',
        '必须返回 scriptSegment, videoPrompt, sceneFramePrompt, firstFramePrompt, lastFramePrompt。',
      ].join('\n');
    }

    return [
      common,
      '请基于当前节点续写下一个节点。',
      '必须返回 scriptSegment, videoPrompt, sceneFramePrompt, firstFramePrompt, lastFramePrompt。',
    ].join('\n');
  }

  compactForModel(prompt: string) {
    return String(prompt || '')
      .replace(/【[^】]+】\s*/g, '')
      .replace(/\n+/g, '，')
      .replace(/\s{2,}/g, ' ')
      .replace(/，，+/g, '，')
      .trim();
  }

  toImageModelPrompt(prompt: string, targetModel?: string) {
    const sections = this.parseSections(prompt);
    return this.buildModelVisualPrompt({
      sections,
      mode: 'image',
      targetModel,
      fallbackPrompt: prompt,
    });
  }

  toVideoModelPrompt(prompt: string, targetModel?: string) {
    const sections = this.parseSections(prompt);
    return this.buildModelVisualPrompt({
      sections,
      mode: 'video',
      targetModel,
      fallbackPrompt: prompt,
    });
  }

  buildContinuityAnchors(current?: { scriptSegment?: string; prompt?: string } | null, idea?: string) {
    if (!current) {
      return `保持主体明确、世界观统一、光线色调稳定，让“${String(idea || '当前创意').trim()}”自然落入同一部作品的视觉体系。`;
    }

    const currentSubject = this.extractSubject(current.scriptSegment, current.prompt);
    const currentSetting = this.extractSetting(current.scriptSegment, current.prompt);
    const currentLighting = this.extractLighting(current.prompt || current.scriptSegment);
    return `延续上一镜头中的${currentSubject}，保持${currentSetting}的空间关系与${this.compactForModel(currentLighting)}的一致性，人物服装、视线方向和镜头节奏保持统一，只变化当前镜头需要推进的部分。`;
  }

  private buildVideoPromptParagraph(input: {
    subjectLine: string;
    settingLine: string;
    actionLine: string;
    cameraLine: string;
    lightingLine: string;
    styleLine: string;
    continuity: string;
    current?: { scriptSegment?: string; prompt?: string } | null;
    idea: string;
  }) {
    const opening = input.current
      ? '镜头延续上一镜头的角色与空间关系'
      : '镜头从故事开场的稳定建立开始';
    return [
      opening,
      `主体是${input.subjectLine}`,
      `场景环境为${input.settingLine}`,
      `动作推进为${input.actionLine}`,
      `镜头语言为${this.compactForModel(input.cameraLine)}`,
      `光线与色彩保持${this.compactForModel(input.lightingLine)}`,
      `整体风格为${this.compactForModel(input.styleLine)}`,
      `连续性要求：${this.compactForModel(input.continuity)}`,
      `围绕“${input.idea}”完成这一镜头的情绪推进和视觉变化，保证首尾状态明确、动作自然、主体稳定、16:9 电影级画面。`,
      `负面约束：${this.negativePrompt}`,
    ].join('，');
  }

  private formatDisplayPrompt(sections: Array<[string, string]>) {
    return sections
      .map(([title, body]) => `【${title}】\n${String(body || '').trim()}`)
      .join('\n\n');
  }

  private pickBest(...values: Array<string | undefined | null>) {
    return values.map((v) => String(v || '').trim()).find(Boolean) || '';
  }

  private buildModelVisualPrompt(input: {
    sections: Record<string, string>;
    mode: 'image' | 'video';
    targetModel?: string;
    fallbackPrompt?: string;
  }) {
    const {
      sections,
      mode,
      targetModel = '',
      fallbackPrompt = '',
    } = input;
    const subject =
      sections['主体与角色'] ||
      this.extractSubject(fallbackPrompt) ||
      '主体明确、辨识度高的人物或核心物体';
    const environment =
      sections['场景与环境'] ||
      this.extractSetting(fallbackPrompt) ||
      '空间层次明确，前景中景背景关系清楚';
    const action =
      sections['动作与姿态'] ||
      sections['起始动作'] ||
      sections['结束状态'] ||
      this.extractAction(fallbackPrompt) ||
      '动作自然连贯，最终落到稳定姿态';
    const camera =
      sections['镜头与构图'] ||
      this.extractCamera(fallbackPrompt) ||
      '中景建立空间，缓慢推进到近景，构图稳定';
    const lighting =
      sections['光线与色彩'] ||
      this.extractLighting(fallbackPrompt) ||
      '光线自然，明暗层次清楚，色彩统一';
    const style =
      sections['风格与质感'] ||
      this.describeTone('cinematic') ||
      '写实电影感，细节清晰，材质可信';
    const continuity =
      sections['连续性锚点'] ||
      '保持主体身份、服装、场景、色温和镜头节奏一致';
    const sourceSummary = this.compactForModel(
      [
        subject,
        environment,
        action,
        camera,
        lighting,
        style,
        mode === 'video' ? continuity : '',
      ]
        .filter(Boolean)
        .join('，'),
    );

    const englishSummary = this.translateVisualText(sourceSummary);
    const englishContinuity = this.translateVisualText(continuity);
    const englishNegative = this.translateNegativePrompt(this.negativePrompt);
    const modelStyleHint = this.resolveModelStyleHint(targetModel, mode);

    if (mode === 'image') {
      return [
        `Cinematic still frame, ${modelStyleHint}, 16:9 composition.`,
        `Subject: ${englishSummary}.`,
        `Camera and composition: ${this.translateVisualText(camera)}.`,
        `Lighting and color: ${this.translateVisualText(lighting)}.`,
        `Style and texture: ${this.translateVisualText(style)}.`,
        `Continuity anchors: ${englishContinuity}.`,
        `Keep the frame readable, stable, detailed, with clear focal subject and believable material texture.`,
        `Chinese direction: ${sourceSummary}.`,
        `Negative prompt: ${englishNegative}.`,
      ]
        .filter(Boolean)
        .join(' ');
    }

    return [
      `Cinematic video shot, ${modelStyleHint}, 16:9 aspect ratio.`,
      `Story beat: ${englishSummary}.`,
      `Motion design: ${this.translateVisualText(action)}.`,
      `Camera movement: ${this.translateVisualText(camera)}.`,
      `Lighting and color continuity: ${this.translateVisualText(lighting)}.`,
      `Continuity anchors: ${englishContinuity}.`,
      'The motion must be gradual, physically believable, and temporally coherent from the opening state to the ending state.',
      'Preserve the same identity, costume silhouette, gaze direction, environment layout, and color temperature unless the prompt explicitly requests a change.',
      `Chinese direction: ${sourceSummary}.`,
      `Negative prompt: ${englishNegative}.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private resolveModelStyleHint(targetModel: string, mode: 'image' | 'video') {
    const model = String(targetModel || '').toLowerCase();
    if (model.includes('flux')) {
      return mode === 'image'
        ? 'natural language visual prompt, cinematic realism, high detail, clean composition'
        : 'cinematic realism, smooth natural motion, stable identity consistency';
    }
    if (model.includes('seedance') || model.includes('wan')) {
      return mode === 'image'
        ? 'clear visual anchor frame, professional cinematography, stable subject'
        : 'professional cinematography, smooth camera motion, stable scene continuity';
    }
    return mode === 'image'
      ? 'cinematic realism, detailed lighting, readable composition'
      : 'cinematic realism, coherent motion, stable continuity';
  }

  private extractSubject(...values: Array<string | undefined>) {
    const source = values.map((v) => String(v || '').trim()).filter(Boolean).join('，');
    if (!source) return '主体明确、辨识度高的人物或核心物体';
    const explicit = source.match(
      /(?:主体|角色|人物|主角|对象|核心元素|画面中心)[:：]?\s*([^\n，。；]{2,28})/i,
    );
    if (explicit?.[1]) return explicit[1].trim();

    const firstSentence = source
      .split(/[。；\n]/)
      .map((item) => item.trim())
      .find(Boolean);
    if (!firstSentence) return '主体明确、辨识度高的人物或核心物体';
    return firstSentence.slice(0, 24);
  }

  private extractSetting(...values: Array<string | undefined>) {
    const source = values.map((v) => String(v || '').trim()).filter(Boolean).join('，');
    const explicit = source.match(
      /(?:场景|环境|空间|地点|背景)[:：]?\s*([^\n，。；]{2,28})/i,
    );
    if (explicit?.[1]) {
      return `以${explicit[1].trim()}为核心空间，前景、中景、背景关系清楚，环境细节可信`;
    }
    return '空间层次分明，前景、中景、背景明确，环境元素服务叙事';
  }

  private extractAction(...values: Array<string | undefined>) {
    const source = values.map((v) => String(v || '').trim()).filter(Boolean).join('，');
    const explicit = source.match(
      /(?:动作|行为|变化|推进)[:：]?\s*([^\n。；]{2,36})/i,
    );
    if (explicit?.[1]) return explicit[1].trim();

    const actionMatches = source.match(
      /(进入|离开|转身|抬头|低头|回望|停顿|坐下|起身|推门|奔跑|伸手|对视|靠近|拿起|展开|收拢|切换|聚焦|拖拽|输入|点击|演示|讲解)/g,
    );
    if (actionMatches?.length) {
      return `主体${Array.from(new Set(actionMatches)).join('、')}，动作节奏清晰并带出镜头推进`;
    }
    return '主体动作自然连贯，先建立状态，再出现关键动作变化，最终落到稳定终态';
  }

  private extractCamera(source?: string) {
    const text = String(source || '');
    const matches = text.match(/(特写|近景|中景|远景|俯拍|仰拍|跟拍|推镜|拉镜|摇镜|环绕|POV|close-up|wide shot|pan|tilt|zoom|tracking)/gi);
    if (matches?.length) return `使用${Array.from(new Set(matches)).join('、')}，镜头运动平稳，构图服务主体情绪`; 
    return '先以中景建立空间，再缓慢推进到近景，必要时轻微跟拍或小幅摇镜，保持主体始终稳定在视觉焦点';
  }

  private extractLighting(source?: string) {
    const text = String(source || '');
    const matches = text.match(/(暖光|冷光|月光|霓虹|逆光|侧光|柔光|硬光|高对比|低饱和|金色|青蓝|烛光|雾气)/g);
    if (matches?.length) return `使用${Array.from(new Set(matches)).join('、')}塑造氛围，明暗层次清楚，肤色与材质表现自然`;
    return '主光与环境光协同，明暗层次自然，色彩统一，人物肤色与材质细节清晰';
  }

  private toStillCamera(cameraLine: string) {
    return `${this.compactForModel(cameraLine)}，单帧构图稳定，主体清晰置于视觉焦点`; 
  }

  private toOpeningCamera(cameraLine: string) {
    return `${this.compactForModel(cameraLine)}，作为起始锚点时画面要更稳定，主体完整入镜，空间关系一眼可读`; 
  }

  private toEndingCamera(cameraLine: string) {
    return `${this.compactForModel(cameraLine)}，在镜头结尾形成稳定停顿，方便下一个镜头衔接`; 
  }

  private toEndingAction(actionLine: string) {
    return `${this.compactForModel(actionLine)}，最后落到可承接下一镜头的稳定姿态与视线方向`; 
  }

  private describeTone(tone: string) {
    switch (tone) {
      case 'suspense':
        return '悬疑压迫、留白克制、镜头信息逐步释放';
      case 'lyrical':
        return '抒情细腻、情绪流动、光线柔和';
      case 'commercial':
        return '商业化强钩子、信息密度高、画面干净有传播感';
      case 'fantasy':
        return '奇幻写实并存、世界观鲜明、视觉奇观明确';
      default:
        return '电影感写实、镜头专业、节奏清晰';
    }
  }

  private extractKeywords(text: string): string[] {
    return Array.from(
      new Set(
        String(text || '')
          .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
          .map((w) => w.trim())
          .filter((w) => w.length >= 2),
      ),
    );
  }

  private parseSections(prompt: string) {
    const map: Record<string, string> = {};
    const regex = /【([^】]+)】\n([\s\S]*?)(?=\n\n【|$)/g;
    const raw = String(prompt || '');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(raw))) {
      map[String(match[1] || '').trim()] = String(match[2] || '').trim();
    }
    return map;
  }

  private translateVisualText(source: string) {
    let text = this.compactForModel(source);
    const replacements: Array<[RegExp, string]> = [
      [/电影感写实、镜头专业、节奏清晰/g, 'cinematic realism, professional shot design, clear pacing'],
      [/奇幻写实并存、世界观鲜明、视觉奇观明确/g, 'fantasy grounded in realism, strong worldbuilding, visually striking spectacle'],
      [/主光与环境光协同，明暗层次自然，色彩统一，人物肤色与材质细节清晰/g, 'balanced key light and ambient light, natural contrast, unified color palette, clear skin tone and material detail'],
      [/使用霓虹塑造氛围，明暗层次清楚，肤色与材质表现自然/g, 'neon atmosphere, clear contrast layers, natural skin tone and believable material texture'],
      [/以前景、中景、背景关系清楚，环境细节可信/g, 'with clear foreground, midground and background depth and believable environmental detail'],
      [/主体动作自然连贯，先建立状态，再出现关键动作变化，最终落到稳定终态/g, 'the subject moves naturally and continuously, starting from a readable state, moving through a key action change, and landing in a stable ending pose'],
      [/先以中景建立空间，再缓慢推进到近景，必要时轻微跟拍或小幅摇镜，保持主体始终稳定在视觉焦点/g, 'begin with a medium shot to establish space, then slowly push into a close-up, with subtle tracking or a gentle pan while keeping the subject stable at the visual focus'],
      [/保持主体身份、服装、场景、色温和镜头节奏一致/g, 'keep identity, costume, environment, color temperature and shot rhythm consistent'],
      [/主体/g, 'main subject'],
      [/角色/g, 'character'],
      [/场景/g, 'scene'],
      [/环境/g, 'environment'],
      [/空间/g, 'space'],
      [/代码/g, 'code'],
      [/图表/g, 'chart'],
      [/看板/g, 'dashboard'],
      [/公式/g, 'formula'],
      [/架构图/g, 'architecture diagram'],
      [/界面/g, 'interface'],
      [/导图/g, 'mind map'],
      [/暖光/g, 'warm key light'],
      [/冷光/g, 'cool ambient light'],
      [/逆光/g, 'backlight'],
      [/侧光/g, 'side light'],
      [/柔光/g, 'soft light'],
      [/中景/g, 'medium shot'],
      [/近景/g, 'close-up'],
      [/远景/g, 'wide shot'],
      [/特写/g, 'close-up detail shot'],
      [/俯拍/g, 'top-down shot'],
      [/仰拍/g, 'low-angle shot'],
      [/跟拍/g, 'tracking shot'],
      [/推镜/g, 'slow push-in'],
      [/拉镜/g, 'slow pull-back'],
      [/摇镜/g, 'gentle pan'],
      [/环绕/g, 'arc shot'],
      [/缓慢/g, 'slowly'],
      [/轻微/g, 'subtly'],
      [/停顿/g, 'pause briefly'],
      [/回望/g, 'glance back'],
      [/抬头/g, 'look up'],
      [/低头/g, 'look down'],
      [/转身/g, 'turn the body'],
      [/走近/g, 'walk closer'],
      [/靠近/g, 'move closer'],
      [/凝视/g, 'gaze steadily'],
      [/对视/g, 'make eye contact'],
      [/电影感/g, 'cinematic'],
      [/写实/g, 'photorealistic'],
      [/质感/g, 'texture detail'],
      [/细节清晰/g, 'sharp detail'],
      [/高质量/g, 'high quality'],
      [/连续性/g, 'continuity'],
      [/上一镜头/g, 'previous shot'],
      [/承接/g, 'carry over'],
      [/避免/g, 'avoid'],
      [/漂移/g, 'drift'],
      [/换脸/g, 'face swap'],
      [/畸形/g, 'deformation'],
      [/背景突然切换/g, 'background jump cut'],
      [/镜头抖动失控/g, 'uncontrolled camera shake'],
      [/低清晰度/g, 'low resolution'],
      [/多余人物抢焦点/g, 'distracting extra people'],
      [/文字水印/g, 'text watermark'],
      [/，/g, ', '],
      [/。/g, '. '],
      [/；/g, '; '],
      [/：/g, ': '],
    ];

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }

    return text
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  private translateNegativePrompt(source: string) {
    return String(source || '')
      .split('，')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const translated = this.translateVisualText(item)
          .replace(/^avoid\s*/i, '')
          .trim();
        return `avoid ${translated}`;
      })
      .join(', ');
  }
}
