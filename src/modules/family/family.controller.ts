import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FamilyService } from './family.service';
import { LinkCodeDto } from './dto/link-code.dto';

interface AuthedRequest {
  user: { userId: string };
}

/** 026 contracts/rest-api.md "Family". The acting user is always `req.user.userId`. */
@Controller('family')
@UseGuards(JwtAuthGuard)
export class FamilyController {
  constructor(private readonly family: FamilyService) {}

  @Get('me')
  me(@Request() req: AuthedRequest) {
    return this.family.getMe(req.user.userId);
  }

  @Post('link-codes')
  @HttpCode(HttpStatus.OK)
  createCode(@Request() req: AuthedRequest) {
    return this.family.createLinkCode(req.user.userId);
  }

  @Get('link-codes/current')
  currentCode(@Request() req: AuthedRequest) {
    return this.family.getCurrentLinkCode(req.user.userId);
  }

  @Delete('link-codes/current')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelCode(@Request() req: AuthedRequest) {
    await this.family.cancelLinkCode(req.user.userId);
  }

  @Post('link-codes/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  preview(@Request() req: AuthedRequest, @Body() dto: LinkCodeDto) {
    return this.family.preview(req.user.userId, dto.code);
  }

  @Post('link-codes/claim')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  claim(@Request() req: AuthedRequest, @Body() dto: LinkCodeDto) {
    return this.family.claim(req.user.userId, dto.code);
  }

  /** US8: balance back to the parent, pending request cancelled, card inactive, watch signed out. */
  @Delete('children/:childId')
  @HttpCode(HttpStatus.OK)
  unlink(@Request() req: AuthedRequest, @Param('childId') childId: string) {
    return this.family.unlink(req.user.userId, childId);
  }

  @Post('link-codes/current/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Request() req: AuthedRequest) {
    return this.family.confirm(req.user.userId);
  }
}
