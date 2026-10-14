import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { bearerToken, type TokenClaims } from '@repo/contracts';
import { authRequirementFor } from './protected-routes.js';

/** Where the guard publishes what it learned, for the proxy to re-use. */
export interface AuthenticatedRequest extends Request {
  auth?: TokenClaims;
}

// Verifies session tokens for the routes listed in PROTECTED_ROUTES. The
// gateway is the single choke point every external request passes through, so
// this is the one place auth can be enforced for all services at once.
// Only headers are read: the proxy streams the body downstream, and consuming
// it here would break that.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requirement = authRequirementFor(request.method, request.originalUrl);

    if (requirement.kind === 'public') {
      // Public is not the same as unsigned: POST /orders is open so anonymous
      // checkout works, but the proxy needs the caller's identity to stamp the
      // order. An absent or invalid token simply proceeds unauthenticated.
      const token = bearerToken(request.headers.authorization);
      if (token) {
        try {
          request.auth = await this.jwt.verifyAsync<TokenClaims>(token);
        } catch {
          // Ignored on purpose: public means public.
        }
      }
      return true;
    }

    const token = bearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let claims: TokenClaims;
    try {
      claims = await this.jwt.verifyAsync<TokenClaims>(token);
    } catch {
      // Signature, shape and expiry all collapse to one answer on purpose.
      throw new UnauthorizedException('Invalid or expired token');
    }

    // An empty role list is a misconfigured rule; refusing is the safe reading.
    if (requirement.roles && !requirement.roles.includes(claims.role)) {
      // 403, not 401: the caller is authenticated, just not allowed.
      throw new ForbiddenException(
        `Requires one of: ${requirement.roles.join(', ') || 'no role'}`,
      );
    }

    request.auth = claims;
    return true;
  }
}
