import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
  async upload(file: Buffer, key: string): Promise<string> {
    // TODO: upload to MinIO
    throw new Error('Not implemented');
  }

  async download(key: string): Promise<Buffer> {
    // TODO
    throw new Error('Not implemented');
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    // TODO
    throw new Error('Not implemented');
  }

  async delete(key: string): Promise<void> {
    // TODO
    throw new Error('Not implemented');
  }
}
