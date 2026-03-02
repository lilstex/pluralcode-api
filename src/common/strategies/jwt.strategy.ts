/* eslint-disable @typescript-eslint/no-unused-vars */
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    super({
      // Accept token from Authorization header OR ?token= query param (useful for Jitsi embeds later)
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.query?.token as string | null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        organization: true,
        // Hydrate fine-grained admin permissions if they exist
        adminPermission: { select: { permissions: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Token invalid. Please login again.');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    if (user.status === 'REJECTED') {
      throw new UnauthorizedException('Your account application was rejected.');
    }

    // Attach flat permissions array to user object for PermissionsGuard
    const { passwordHash, otp, otpExpiresAt, adminPermission, ...safeUser } =
      user as any;

    return {
      ...safeUser,
      adminPermissions: adminPermission?.permissions ?? [],
    };
  }
}
