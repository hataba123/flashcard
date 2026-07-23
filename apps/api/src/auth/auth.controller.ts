import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthService, type AuthResult } from './auth.service.js';

const REFRESH_COOKIE = 'flashcard_refresh';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register an account and create a device session' })
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResult> {
    return this.sendAuthResult(response, await this.authService.register(input));
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log in and create a rotating refresh session' })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResult> {
    return this.sendAuthResult(response, await this.authService.login(input));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the HttpOnly refresh token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResult> {
    return this.sendAuthResult(
      response,
      await this.authService.refresh(request.cookies[REFRESH_COOKIE] as string)
    );
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.authService.logout(request.cookies[REFRESH_COOKIE] as string | undefined);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: UserEntity,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserEntity): Pick<UserEntity, 'id' | 'email' | 'timezone'> {
    return { id: user.id, email: user.email, timezone: user.timezone };
  }

  private sendAuthResult(response: Response, result: AuthResult): AuthResult {
    response.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
    return { ...result, refreshToken: '' };
  }

  private cookieOptions(): { httpOnly: true; sameSite: 'lax'; secure: boolean; path: string } {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth'
    };
  }
}
