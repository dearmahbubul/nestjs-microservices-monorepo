import { BadRequestException } from '@nestjs/common';

/** Largest page we will serve. Keeps `?limit=1000000` from becoming a DoS. */
export const MAX_PAGE_SIZE = 100;

/** An already-validated page request. */
export interface ProductPage {
  limit?: number;
  offset?: number;
}

// Reads limit/offset off a query string. Absent is "unbounded" for both.
// The two bounds have different minimums on purpose: offset starts at 0 (the
// first page), limit starts at 1 (a zero page size reads as "end of catalog").
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
  // `Number` rather than `parseInt`: parseInt('12abc') is 12, which would let
  // a malformed query quietly mean something. Number('12abc') is NaN.
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
