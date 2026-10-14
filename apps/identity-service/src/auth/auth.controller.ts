import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { bearerToken } from '@repo/contracts';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto?.email, dto?.password);
  }

  /** Public signup for shop customers. Same shape as `login`. */
  @Post('register')
  @HttpCode(201)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Get('me')
  me(@Headers('authorization') header: string) {
    const token = bearerToken(header);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return this.auth.currentUser(token);
  }

  @Post('logout')
  @HttpCode(204)
  logout(): void {
    // Tokens are stateless: logging out is the client discarding its cookie.
    // The endpoint exists so there is one obvious thing for a client to call.
  }
}
