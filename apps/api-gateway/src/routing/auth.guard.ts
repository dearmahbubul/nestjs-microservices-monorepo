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

/**
 * Verifies session tokens for the routes listed in `PROTECTED_ROUTES`.
 *
 * The gateway is the single place every external request passes through, so
 * this is the one choke point where authentication can be enforced for all
 * services at once — otherwise each service would need its own guard and any
 * one of them forgetting would leave a hole.
 *
 * Only headers are read. The request body is deliberately left untouched: the
 * proxy streams it downstream, and consuming it here would break that.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const requirement = authRequirementFor(request.method, request.originalUrl);

    if (requirement.kind === 'public') {
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

    if (requirement.role !== undefined && claims.role !== requirement.role) {
      // 403, not 401: the caller is authenticated, just not allowed.
      throw new ForbiddenException(`Requires role '${requirement.role}'`);
    }

    return true;
  }
}
