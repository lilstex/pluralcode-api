import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  // This method checks if the user has the required role
  matchRoles(roles: string[], userRole: string): boolean {
    return roles.includes(userRole);
  }

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.get<string[]>('roles', context.getHandler()); // Get roles from metadata
    if (!roles) {
      return true; // If no roles are defined, allow access
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If there's no user or role, deny access
    if (!user || !user.role) {
      throw new ForbiddenException(
        'User does not have a role to access this resource',
      );
    }

    // Check if the user's role matches the required roles
    if (!this.matchRoles(roles, user.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }
    return true; // Grant access if the role matches
  }
}
