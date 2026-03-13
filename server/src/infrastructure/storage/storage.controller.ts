import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get(':bucket/*')
  async getObject(
    @Param('bucket') bucket: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (bucket !== this.storageService.getBucketName()) {
      throw new NotFoundException('Bucket not found');
    }

    const wildcardPath = this.resolveObjectKey(req, bucket);
    if (!wildcardPath) {
      throw new NotFoundException('Object path is required');
    }

    const objectKey = wildcardPath
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');

    const stream = await this.storageService.downloadStream(objectKey);
    const meta = await this.storageService.getMetadata(objectKey).catch(() => null as any);
    const metaMap = (meta?.metaData ?? {}) as Record<string, string>;
    const contentType =
      metaMap['content-type'] ||
      metaMap['Content-Type'] ||
      metaMap['x-amz-meta-content-type'] ||
      'application/octet-stream';

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    (stream as NodeJS.ReadableStream).pipe(res);
  }

  private resolveObjectKey(req: Request, bucket: string): string {
    const paramPath =
      req.params?.[0] ||
      req.params?.['0'] ||
      req.params?.objectKey ||
      '';
    if (paramPath) {
      return String(paramPath);
    }

    const originalUrl = String(req.originalUrl || req.url || '');
    const withoutQuery = originalUrl.split('?')[0] || '';
    const storagePrefix = `/storage/${bucket}/`;
    const apiStoragePrefix = `/api/storage/${bucket}/`;

    if (withoutQuery.startsWith(storagePrefix)) {
      return withoutQuery.slice(storagePrefix.length);
    }
    if (withoutQuery.startsWith(apiStoragePrefix)) {
      return withoutQuery.slice(apiStoragePrefix.length);
    }

    return '';
  }
}
