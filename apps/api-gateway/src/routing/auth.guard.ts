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
 *
 * The verified claims are stashed on the request so the proxy can act on the
 * authenticated identity (see `ProxyService.forward`) without verifying the
 * token a second time or, worse, trusting something the client sent.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requirement = authRequirementFor(request.method, request.originalUrl);

    if (requirement.kind === 'public') {
      // A public route still gets its identity established when a token is
      // present, because "public" and "unsigned" are not the same thing here.
      // Order creation is deliberately open — an anonymous visitor may buy
      // something — but the proxy has to know who is asking in order to stamp
      // the order with the right email. Without this the body's own
      // `customerEmail` would be taken at face value and an order could be
      // filed under somebody else's address.
      //
      // A token that is absent or invalid is not an error on a public route:
      // the request simply proceeds unauthenticated, and the proxy supplies no
      // scope. Only a *verified* token can widen or narrow anything.
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
