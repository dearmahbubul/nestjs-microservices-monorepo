/**
 * Login payload.
 *
 * A plain interface validated in `AuthService`, matching how `orders-service`
 * and `catalog-service` handle their write DTOs — the repo has no
 * class-validator dependency and one service validating differently would be
 * the odd one out.
 */
export interface LoginDto {
  email: string;
  password: string;
}
