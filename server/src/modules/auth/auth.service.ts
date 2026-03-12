import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { RegisterDto, LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async register(dto: RegisterDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const existing = await this.userService.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('该邮箱已注册');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.userService.create({
      email: normalizedEmail,
      passwordHash,
      name: dto.name?.trim() || undefined,
    });

    const token = this.generateToken(user.id, user.email);
    return { user, token };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const user = await this.userService.findByEmail(normalizedEmail);
    if (!user) {
      if (this.configService.get<string>('AUTH_AUTO_REGISTER_ON_LOGIN', '0') === '1') {
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const createdUser = await this.userService.create({
          email: normalizedEmail,
          passwordHash,
        });

        const token = this.generateToken(createdUser.id, createdUser.email);
        return {
          user: createdUser,
          token,
        };
      }
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const token = this.generateToken(user.id, user.email);
    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    };
  }

  async validateUser(userId: string) {
    return this.userService.findById(userId);
  }

  private generateToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
