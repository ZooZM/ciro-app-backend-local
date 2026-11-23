import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { CreateDeviceSessionDto } from './dto/create-device-session.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DeviceTokensRepository } from '../notifications/device-tokens.repository';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly deviceTokensRepository: DeviceTokensRepository,
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('send-otp')
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-otp')
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('device-token')
  async registerDeviceToken(
    @Request() req: any,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    await this.deviceTokensRepository.upsertToken(
      req.user.userId,
      dto.token,
      dto.platform,
      dto.locale ?? 'ar',
    );
  }

  /** 026 (R8): the iPhone mints the watch's own session for the linked child. */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('device-sessions')
  async createDeviceSession(
    @Request() req: any,
    @Body() dto: CreateDeviceSessionDto,
  ) {
    void dto; // `deviceType` is validated (only 'watch'); the session is always the watch's
    return this.authService.createDeviceSession(req.user.userId);
  }

  /** Idempotent; also removes the user's watch push tokens. */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('device-sessions/watch')
  async revokeWatchSession(@Request() req: any) {
    await this.authService.revokeDeviceSession(req.user.userId, 'logout');
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('device-token')
  async unregisterDeviceTokens(@Request() req: any) {
    await this.deviceTokensRepository.deleteAllTokensForUser(req.user.userId);
  }
}
