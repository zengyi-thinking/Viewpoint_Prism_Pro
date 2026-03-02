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

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.endPoint = this.configService.get('MINIO_ENDPOINT', 'localhost');
    this.port = parseInt(this.configService.get('MINIO_PORT', '9000'), 10);
    this.useSSL = this.configService.get('MINIO_USE_SSL', 'false') === 'true';
    this.bucketName = this.configService.get('MINIO_BUCKET', 'viewpoint-prism');

    const accessKey = this.configService.get('MINIO_ACCESS_KEY', 'minioadmin');
    const secretKey = this.configService.get('MINIO_SECRET_KEY', 'minioadmin');

    this.client = new Minio.Client({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: this.useSSL,
      accessKey,
      secretKey,
      region: 'us-east-1', // 添加 region 参数以避免签名问题
    });

    try {
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
    } catch (error) {
      this.logger.error(`Failed to initialize MinIO: ${error.message}`, error.stack);
      // Don't throw - allow app to start even if MinIO is not available
    }
  }

  /**
   * Upload a buffer to MinIO
   * @param buffer - File buffer
   * @param key - Storage key (path)
   * @param metaData - Optional metadata (contentType, etc.)
   * @returns The URL of the uploaded file
   */
  async upload(buffer: Buffer, key: string, metaData?: Record<string, string>): Promise<string> {
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
    try {
      return await this.client.getObject(this.bucketName, key);
    } catch (error) {
      this.logger.error(`Failed to get stream for ${key}: ${error.message}`, error.stack);
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
    try {
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
    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endPoint}:${this.port}/${this.bucketName}/${key}`;
  }

  /**
   * Delete a file from MinIO
   * @param key - Storage key
   */
  async delete(key: string): Promise<void> {
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
}
