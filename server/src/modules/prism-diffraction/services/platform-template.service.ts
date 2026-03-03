import { Injectable } from '@nestjs/common';

interface PlatformTemplate {
  id: string;
  platform: string;
  name: string;
  template: string;
  isDefault: boolean;
}

@Injectable()
export class PlatformTemplateService {
  async getTemplates(platform: string): Promise<PlatformTemplate[]> {
    // 返回默认模板
    return this.getDefaultTemplates(platform);
  }

  private getDefaultTemplates(platform: string): PlatformTemplate[] {
    switch (platform) {
      case 'xiaohongshu':
        return [
          {
            id: 'xiaohongshu_v1',
            platform: 'xiaohongshu',
            name: '种草感+焦虑',
            template: '默认小红书种草模板',
            isDefault: true,
          },
        ];
      case 'twitter_x':
        return [
          {
            id: 'twitter_x_v1',
            platform: 'twitter_x',
            name: '悬念干货',
            template: '默认 Twitter Thread 模板',
            isDefault: true,
          },
        ];
      case 'newsletter':
        return [
          {
            id: 'newsletter_v1',
            platform: 'newsletter',
            name: '深度结构化',
            template: '默认 Newsletter 模板',
            isDefault: true,
          },
        ];
      case 'linkedin':
        return [
          {
            id: 'linkedin_v1',
            platform: 'linkedin',
            name: '专业洞见',
            template: '默认 LinkedIn 模板',
            isDefault: true,
          },
        ];
      case 'instagram':
        return [
          {
            id: 'instagram_v1',
            platform: 'instagram',
            name: '精美美学',
            template: '默认 Instagram 模板',
            isDefault: true,
          },
        ];
      default:
        return [];
    }
  }
}
