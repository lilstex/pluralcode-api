import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard.
 *
 * Unlike JwtAuthGuard, this guard does NOT throw 401 when no token is
 * present or when the token is invalid. It simply sets req.user to the
 * validated user if a valid token is provided, or leaves req.user
 * undefined if no token is present.
 *
 * Used on public routes that serve richer responses to authenticated
 * callers (e.g. GET /resources returns contentUrl only to signed-in users).
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  // Override handleRequest so that missing/invalid tokens are silently ignored
  handleRequest(_err: any, user: any) {
    // If no user or token error, return null (don't throw)
    return user || null;
  }

  // canActivate must still be called so that Passport runs and populates req.user
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
