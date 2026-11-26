import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CardsService } from './cards.service';

interface AuthedRequest {
  user: { userId: string };
}

/** 026 contracts/rest-api.md "Cards". Parent routes re-check ownership; child routes use `me`. */
@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get('children/:childId')
  child(@Request() req: AuthedRequest, @Param('childId') childId: string) {
    return this.cards.getCard(req.user.userId, childId);
  }

  @Get('me')
  mine(@Request() req: AuthedRequest) {
    return this.cards.getMyCard(req.user.userId);
  }

  @Post('children/:childId/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Request() req: AuthedRequest, @Param('childId') childId: string) {
    return this.cards.pause(req.user.userId, childId);
  }

  @Post('children/:childId/resume')
  @HttpCode(HttpStatus.OK)
  resume(@Request() req: AuthedRequest, @Param('childId') childId: string) {
    return this.cards.resume(req.user.userId, childId);
  }
}
