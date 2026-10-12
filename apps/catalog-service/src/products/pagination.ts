import { BadRequestException } from '@nestjs/common';

/** Largest page we will serve. Keeps `?limit=1000000` from becoming a DoS. */
export const MAX_PAGE_SIZE = 100;

/** An already-validated page request, ready for `Repository.find`. */
export interface ProductPage {
  limit?: number;
  offset?: number;
}

/**
 * Reads `limit`/`offset` off a query string.
 *
 * A pure function in its own module rather than a private helper on the
 * controller: the bounds are the part with an off-by-one waiting to happen, and
 * a function with no Nest DI to stand up is one `spec` file away from being
 * pinned down. It throws `BadRequestException` rather than returning a result
 * object, matching how the write DTOs in this service are validated — the repo
 * has no class-validator, and a decorator that silently no-ops when its pipe is
 * not wired is worse than an explicit parse.
 *
 * Absent is "unbounded" for both, which is what keeps a bare `GET /products`
 * returning the whole catalog for the admin panel and the seed scripts.
 *
 * The two bounds have *different* minimums, and that is not an oversight:
 *
 * - `offset` starts at **0**. It is the first page. Rejecting it breaks the
 *   opening request of every paged read — which is exactly the bug this
 *   distinction was written to fix after a probe caught it.
 * - `limit` starts at **1**. A zero page size returns an empty array, which an
 *   infinite scroll reads as "the end of the catalog" and stops on. A silent
 *   wrong answer is much worse than a 400.
 */
export function parsePage(limit?: string, offset?: string): ProductPage {
  return {
    limit: parseBound(limit, 'limit', { min: 1, max: MAX_PAGE_SIZE }),
    offset: parseBound(offset, 'offset', { min: 0 }),
  };
}

function parseBound(
  value: string | undefined,
  name: string,
  { min, max }: { min: number; max?: number },
): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  // `Number` rather than `parseInt`: parseInt('12abc') is 12, which would let a
  // malformed query quietly mean something. Number('12abc') is NaN.
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException(`${name} must be an integer`);
  }
  if (parsed < min) {
    throw new BadRequestException(`${name} must be at least ${min}`);
  }
  if (max !== undefined && parsed > max) {
    throw new BadRequestException(`${name} must not exceed ${max}`);
  }
  return parsed;
}
