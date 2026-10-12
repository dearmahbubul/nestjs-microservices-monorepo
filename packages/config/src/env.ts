/**
 * Fail-fast environment variable parsing.
 *
 * A misconfigured port, flag or URL should stop the process at boot rather
 * than surface later as a 500. Every service reads its environment through
 * these helpers so validation and error messages stay consistent.
 */

/** Source of environment variables. Defaults to `process.env`. */
export type EnvSource = Record<string, string | undefined>;

const defaultEnv: EnvSource = process.env;

function read(name: string, env: EnvSource): string | undefined {
  const raw = env[name];
  return raw === undefined || raw === '' ? undefined : raw;
}

export function toInt(
  name: string,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  env: EnvSource = defaultEnv,
): number {
  const raw = read(name, env);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    const bounds =
      max === Number.MAX_SAFE_INTEGER ? `>= ${min}` : `between ${min} and ${max}`;
    throw new Error(
      `Invalid ${name}: expected an integer ${bounds}, got '${raw}'`,
    );
  }
  return value;
}

export function toBool(
  name: string,
  fallback: boolean,
  env: EnvSource = defaultEnv,
): boolean {
  const raw = read(name, env);
  if (raw === undefined) {
    return fallback;
  }
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`Invalid ${name}: expected 'true' or 'false', got '${raw}'`);
  }
  return raw === 'true';
}

export function toUrl(
  name: string,
  fallback: string,
  env: EnvSource = defaultEnv,
): string {
  const raw = read(name, env);
  if (raw === undefined) {
    return fallback;
  }
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute URL, got '${raw}'`);
  }
}
