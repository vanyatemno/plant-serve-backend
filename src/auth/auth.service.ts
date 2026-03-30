import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto';
import type { JwtPayload } from '../common';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  // ─── Register ──────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
    });

    return this.generateTokenPair(user.id, user.email);
  }

  // ─── Login ─────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokenPair(user.id, user.email);
  }

  // ─── Refresh ───────────────────────────────────────────────────────
  async refresh(refreshToken: string) {
    // Verify the refresh token JWT
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Hash the incoming token and look it up in DB
    const tokenHash = await this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash,
      },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // If not found, possible token reuse — revoke all tokens for this user
      await this.prisma.refreshToken.deleteMany({
        where: { userId: payload.sub },
      });
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    // Delete the old refresh token (rotation)
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Issue new token pair
    return this.generateTokenPair(payload.sub, payload.email);
  }

  // ─── Logout ────────────────────────────────────────────────────────
  async logout(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      // Even if the token is invalid/expired, we just return success
      return { message: 'Logged out successfully' };
    }

    const tokenHash = await this.hashToken(refreshToken);

    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: payload.sub,
        tokenHash,
      },
    });

    return { message: 'Logged out successfully' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  private async generateTokenPair(userId: string, email: string) {
    const jwtPayload: JwtPayload = { sub: userId, email };

    const accessToken = this.jwtService.sign(jwtPayload, {
      secret: this.accessSecret,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(jwtPayload, {
      secret: this.refreshSecret,
      expiresIn: '7d',
    });

    // Store the hashed refresh token in DB
    const tokenHash = await this.hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private async hashToken(token: string): Promise<string> {
    // Use a fast hash for token lookup (SHA-256 via crypto)
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
