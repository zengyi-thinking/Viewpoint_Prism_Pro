import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  private bucketName: string;
  private endPoint: string;
  private port: number;
  private useSSL: boolean;
  private minioReady = false;
  private publicBaseUrl: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getFirstConfigValue(keys: string[], fallback = ''): string {
    for (const key of keys) {
      const value = String(this.configService.get(key) || '').trim();
      if (value) return value;
    }

    return fallback;
  }

  async onModuleInit() {
    this.endPoint = this.getFirstConfigValue(['MINIO_ENDPOINT', 'S3_ENDPOINT'], 'localhost');
    this.port = parseInt(this.getFirstConfigValue(['MINIO_PORT', 'S3_PORT'], '9000'), 10);
    this.useSSL =
      this.getFirstConfigValue(['MINIO_USE_SSL', 'S3_USE_SSL', 'S3_SSL'], 'false') === 'true';
    this.bucketName = this.getFirstConfigValue(
      ['MINIO_BUCKET', 'S3_BUCKET'],
      'viewpoint-prism',
    );
    this.publicBaseUrl =
      this.getFirstConfigValue([
        'MINIO_PUBLIC_BASE_URL',
        'S3_PUBLIC_BASE_URL',
        'APP_PUBLIC_URL',
        'NEXTAUTH_URL',
      ]) ||
      null;

    const accessKey = this.getFirstConfigValue(
      ['MINIO_ACCESS_KEY', 'MINIO_ROOT_USER', 'S3_ACCESS_KEY', 'AWS_ACCESS_KEY_ID'],
      'minioadmin',
    );
    const secretKey = this.getFirstConfigValue(
      ['MINIO_SECRET_KEY', 'MINIO_ROOT_PASSWORD', 'S3_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY'],
      'minioadmin',
    );

    this.client = new Minio.Client({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey,
      secretKey,
      region: 'us-east-1', // 添加 region 参数以避免签名问题
    });

    try {
      const isHealthy = await this.checkMinioHealth();
      if (!isHealthy) {
        this.logger.warn(
          `MinIO health check failed at ${this.endPoint}:${this.port}. ` +
            'Current endpoint is not a reachable MinIO service. Storage features will fail until MinIO is available.',
        );
        return;
      }

      // Ensure bucket exists
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        this.logger.log(`Bucket "${this.bucketName}" does not exist. Creating...`);
        await this.client.makeBucket(this.bucketName);
        this.logger.log(`Bucket "${this.bucketName}" created successfully.`);
      } else {
        this.logger.log(`Bucket "${this.bucketName}" already exists.`);
      }

      // Set bucket policy to allow public read (for development)
      const publicReadPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucketName}/*`],
          },
        ],
      };

      await this.client.setBucketPolicy(
        this.bucketName,
        JSON.stringify(publicReadPolicy),
      );
      this.logger.log(`Bucket "${this.bucketName}" policy set to public read.`);
      this.minioReady = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to initialize MinIO at ${this.endPoint}:${this.port}: ${message}. ` +
          'Please verify MINIO_ENDPOINT/MINIO_PORT and credentials.',
      );
      // Don't throw - allow app to start even if MinIO is not available
    }
  }

  private async checkMinioHealth(): Promise<boolean> {
    const protocol = this.useSSL ? 'https' : 'http';
    const healthUrl = `${protocol}://${this.endPoint}:${this.port}/minio/health/live`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const res = await fetch(healthUrl, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertMinioReady(): void {
    if (this.minioReady) return;
    throw new Error(
      `MinIO is not ready at ${this.endPoint}:${this.port}. ` +
        'Start MinIO service or fix MINIO_ENDPOINT/MINIO_PORT before using storage APIs.',
    );
  }

  /**
   * Upload a buffer to MinIO
   * @param buffer - File buffer
   * @param key - Storage key (path)
   * @param metaData - Optional metadata (contentType, etc.)
   * @returns The URL of the uploaded file
   */
  async upload(buffer: Buffer, key: string, metaData?: Record<string, string>): Promise<string> {
    this.assertMinioReady();
    try {
      const normalizedMetaData = this.normalizeMetaData(metaData);
      // 修复：使用类型断言绕过 minio v8 的类型定义问题
      // @types/minio@7.1.0 与 minio@8.0.7 的类型定义不匹配
      await (this.client.putObject as any)(
        this.bucketName,
        key,
        buffer,
        normalizedMetaData,
      );
      const url = await this.getPublicUrl(key);
      this.logger.log(`Uploaded file to ${key}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to upload file to ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Upload a stream to MinIO
   * @param stream - Readable stream
   * @param key - Storage key (path)
   * @param size - File size in bytes
   * @param metaData - Optional metadata
   * @returns The URL of the uploaded file
   */
  async uploadStream(
    stream: any,
    key: string,
    size: number,
    metaData?: Record<string, string>,
  ): Promise<string> {
    this.assertMinioReady();
    try {
      const normalizedMetaData = this.normalizeMetaData(metaData);
      // 使用类型断言绕过 minio v8 的类型定义问题
      await (this.client.putObject as any)(
        this.bucketName,
        key,
        stream,
        size,
        normalizedMetaData,
      );
      const url = await this.getPublicUrl(key);
      this.logger.log(`Uploaded stream to ${key}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to upload stream to ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Download a file from MinIO as buffer
   * @param key - Storage key
   * @returns File buffer
   */
  async download(key: string): Promise<Buffer> {
    this.assertMinioReady();
    try {
      const stream = await this.client.getObject(this.bucketName, key);
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      this.logger.error(`Failed to download file ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a download stream for a file
   * @param key - Storage key
   * @returns Readable stream
   */
  async downloadStream(key: string): Promise<NodeJS.ReadableStream> {
    this.assertMinioReady();
    try {
      return await this.client.getObject(this.bucketName, key);
    } catch (error) {
      this.logger.error(`Failed to get stream for ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a partial download stream for a file.
   * @param key - Storage key
   * @param offset - Byte offset
   * @param length - Byte length (0 means until EOF)
   * @returns Readable stream
   */
  async downloadStreamRange(
    key: string,
    offset: number,
    length = 0,
  ): Promise<NodeJS.ReadableStream> {
    this.assertMinioReady();
    try {
      return await (this.client.getPartialObject as any)(
        this.bucketName,
        key,
        offset,
        length,
      );
    } catch (error) {
      this.logger.error(
        `Failed to get partial stream for ${key} at ${offset}+${length}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Generate a presigned URL for temporary access
   * @param key - Storage key
   * @param expiresIn - Expiry time in seconds (default: 24 hours)
   * @returns Presigned URL
   */
  async getSignedUrl(key: string, expiresIn = 24 * 60 * 60): Promise<string> {
    this.assertMinioReady();
    try {
      if (this.shouldUseProxiedPublicUrl()) {
        return await this.getPublicUrl(key);
      }

      return await this.client.presignedGetObject(this.bucketName, key, expiresIn);
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get public URL for a file (for internal use, assumes MinIO is accessible)
   * @param key - Storage key
   * @returns Public URL
   */
  async getPublicUrl(key: string): Promise<string> {
    if (this.shouldUseProxiedPublicUrl()) {
      const base = this.publicBaseUrl?.replace(/\/+$/, '');
      const normalizedKey = key
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      return `${base}/storage/${this.bucketName}/${normalizedKey}`;
    }

    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endPoint}:${this.port}/${this.bucketName}/${key}`;
  }

  /**
   * Resolve an object key from either a raw storage path or a public MinIO URL.
   */
  resolveStorageKey(input: string): string {
    if (!input) {
      throw new Error('Storage key is empty');
    }

    const trimmed = input.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/^\/+/, '');
    }

    const parsed = new URL(trimmed);
    const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
    const bucketPrefix = `${this.bucketName}/`;
    const proxiedPrefix = `storage/${this.bucketName}/`;

    if (pathname.startsWith(bucketPrefix)) {
      return pathname.slice(bucketPrefix.length);
    }

    if (pathname.startsWith(proxiedPrefix)) {
      return pathname.slice(proxiedPrefix.length);
    }

    return pathname;
  }

  private shouldUseProxiedPublicUrl(): boolean {
    if (!this.publicBaseUrl) return false;
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(this.endPoint)) {
      return true;
    }

    // Docker / private network aliases such as "minio" are not browser-reachable.
    return !this.endPoint.includes('.');
  }

  /**
   * Delete a file from MinIO
   * @param key - Storage key
   */
  async delete(key: string): Promise<void> {
    this.assertMinioReady();
    try {
      await this.client.removeObject(this.bucketName, key);
      this.logger.log(`Deleted file ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete multiple files
   * @param keys - Array of storage keys
   */
  async deleteMultiple(keys: string[]): Promise<void> {
    this.assertMinioReady();
    try {
      await this.client.removeObjects(this.bucketName, keys);
      this.logger.log(`Deleted ${keys.length} files`);
    } catch (error) {
      this.logger.error(`Failed to delete files: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Check if a file exists
   * @param key - Storage key
   * @returns True if file exists
   */
  async exists(key: string): Promise<boolean> {
    this.assertMinioReady();
    try {
      await this.client.statObject(this.bucketName, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   * @param key - Storage key
   * @returns Object stats
   */
  async getMetadata(key: string): Promise<Minio.BucketItemStat> {
    this.assertMinioReady();
    try {
      return await this.client.statObject(this.bucketName, key);
    } catch (error) {
      this.logger.error(`Failed to get metadata for ${key}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * List objects with a prefix
   * @param prefix - Path prefix
   * @returns List of objects
   */
  async listObjects(prefix: string): Promise<Minio.BucketItem[]> {
    this.assertMinioReady();
    try {
      const objects: any[] = [];
      const stream = this.client.listObjects(this.bucketName, prefix, true);
      return new Promise((resolve, reject) => {
        stream.on('data', (obj: any) => {
          if (obj && typeof obj === 'object' && obj.name) {
            objects.push(obj as Minio.BucketItem);
          }
        });
        stream.on('error', reject);
        stream.on('end', () => resolve(objects as Minio.BucketItem[]));
      });
    } catch (error) {
      this.logger.error(`Failed to list objects with prefix ${prefix}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate a unique storage path for a user's file
   * @param userId - User ID
   * @param projectId - Project ID
   * @param type - File type (videos, keyframes, renders, exports, assets)
   * @param filename - Original filename
   * @returns Storage key
   */
  generateStoragePath(userId: string, projectId: string, type: string, filename: string): string {
    // Add timestamp to avoid collisions
    const timestamp = Date.now();
    const ext = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
    const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${userId}/${projectId}/${type}/${timestamp}-${sanitizedName}${ext}`;
  }

  /**
   * Normalize metadata headers to avoid non-ASCII signature mismatch in S3/MinIO.
   */
  private normalizeMetaData(metaData?: Record<string, string>): Record<string, string> {
    if (!metaData) return {};

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(metaData)) {
      if (value == null) continue;
      const text = String(value);
      normalized[key] = /[^\x20-\x7E]/.test(text) ? encodeURIComponent(text) : text;
    }

    return normalized;
  }

  getBucketName(): string {
    return this.bucketName;
  }
}
