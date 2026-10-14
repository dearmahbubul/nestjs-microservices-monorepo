// Registration payload. No `role` field on purpose: the service always
// creates a `customer`, and admin accounts come from the seeder.
export interface RegisterDto {
  email: string;
  password: string;
}
