import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, avatarUrl: true, profile: true, createdAt: true },
    });
  }

  async create(data: { email: string; passwordHash: string; name?: string }) {
    return this.prisma.user.create({
      data,
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }
}
