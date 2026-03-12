import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async findByEmail(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, avatarUrl: true, profile: true, createdAt: true },
    });
  }

  async create(data: { email: string; passwordHash: string; name?: string }) {
    return this.prisma.user.create({
      data: {
        ...data,
        email: this.normalizeEmail(data.email),
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }
}
