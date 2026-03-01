import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission, ROLE_DEFAULT_PERMISSIONS } from '../constants/permissions';

/**
 * Fine-grained permissions guard.
 *
 * Resolution order:
 *  1. If the user has a DB-level `adminPermissions` array (set by Super Admin), use that.
 *  2. Otherwise, fall back to the ROLE_DEFAULT_PERMISSIONS map.
 *
 * Must be used AFTER JwtAuthGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    // user.adminPermissions is an optional string[] hydrated by JwtStrategy
    const effective: string[] =
      user.adminPermissions?.length > 0
        ? user.adminPermissions
        : (ROLE_DEFAULT_PERMISSIONS[user.role] ?? []);

    const hasAll = required.every((p) => effective.includes(p));

    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required permission(s): ${required.join(', ')}.`,
      );
    }

    return true;
  }
}
