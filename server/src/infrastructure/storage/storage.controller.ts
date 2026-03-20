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

  private parseSingleRange(rangeHeader: string | undefined, totalSize: number) {
    if (!rangeHeader) return null;

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match) return 'invalid' as const;

    const [, rawStart, rawEnd] = match;
    let start: number;
    let end: number;

    if (!rawStart && !rawEnd) {
      return 'invalid' as const;
    }

    if (!rawStart) {
      const suffixLength = Number(rawEnd);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return 'invalid' as const;
      }
      start = Math.max(0, totalSize - suffixLength);
      end = totalSize - 1;
    } else {
      start = Number(rawStart);
      end = rawEnd ? Number(rawEnd) : totalSize - 1;
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start >= totalSize
    ) {
      return 'invalid' as const;
    }

    end = Math.min(end, totalSize - 1);

    return {
      start,
      end,
      length: end - start + 1,
    };
  }

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
    const totalSize = Number(meta?.size ?? 0);
    const range = this.parseSingleRange(req.headers.range, totalSize);

    if (range === 'invalid') {
      res.status(416);
      res.set('Content-Range', `bytes */${totalSize}`);
      res.end();
      return;
    }

    const outputStream =
      range && totalSize > 0
        ? await this.storageService.downloadStreamRange(objectKey, range.start, range.length)
        : stream;

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
      ...(totalSize > 0 ? { 'Content-Length': String(range ? range.length : totalSize) } : {}),
      ...(range
        ? { 'Content-Range': `bytes ${range.start}-${range.end}/${totalSize}` }
        : {}),
    });
    if (range) {
      res.status(206);
    }

    (outputStream as NodeJS.ReadableStream).pipe(res);
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
