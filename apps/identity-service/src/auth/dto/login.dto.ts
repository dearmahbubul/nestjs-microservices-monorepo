/** Login payload. Plain interface, validated in `AuthService`. */
export interface LoginDto {
  email: string;
  password: string;
}
