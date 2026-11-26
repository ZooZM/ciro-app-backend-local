import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AllowanceRequestsService } from './allowance-requests.service';
import { CreateAllowanceRequestDto } from './dto/create-allowance-request.dto';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { DeclineRequestDto } from './dto/decline-request.dto';
import { ListRequestsQuery } from './dto/list-requests.query';

interface AuthedRequest {
  user: { userId: string };
}

/** 026 contracts/rest-api.md "Allowance requests". The acting user is always the JWT's. */
@Controller('allowance-requests')
@UseGuards(JwtAuthGuard)
export class AllowanceRequestsController {
  constructor(private readonly service: AllowanceRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Request() req: AuthedRequest,
    @Body() dto: CreateAllowanceRequestDto,
  ) {
    return this.service.create(req.user.userId, dto);
  }

  @Get('me')
  mine(@Request() req: AuthedRequest, @Query() query: ListRequestsQuery) {
    return this.service.listMine(req.user.userId, query);
  }

  @Get()
  forParent(@Request() req: AuthedRequest, @Query() query: ListRequestsQuery) {
    return this.service.listForParent(req.user.userId, query);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Request() req: AuthedRequest, @Param('id') id: string) {
    return this.service.cancel(req.user.userId, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Request() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
  ) {
    return this.service.approve(req.user.userId, id, dto);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @Request() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: DeclineRequestDto,
  ) {
    return this.service.decline(req.user.userId, id, dto);
  }
}
