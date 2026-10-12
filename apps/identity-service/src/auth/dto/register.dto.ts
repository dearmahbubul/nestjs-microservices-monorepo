/**
 * Registration payload.
 *
 * Same convention as `LoginDto`: a plain interface validated in `AuthService`
 * rather than a class-validator decorator, because the repo has no
 * class-validator dependency and one service validating differently would be
 * the odd one out.
 *
 * There is deliberately no `role` field. A caller must not be able to ask for
 * `admin` — the service always creates a `customer`, and admin accounts come
 * from the seeder.
 */
export interface RegisterDto {
  email: string;
  password: string;
}
