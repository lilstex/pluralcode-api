import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => {
          return req?.query?.token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  /**
   * Passport will call this method after successfully decoding the JWT.
   */
  async validate(payload: any) {
    const userId = payload.sub || payload.id;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organizations: { select: { id: true, name: true, sector: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'User no longer authorised. Please login again.',
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    return user;
  }
}
