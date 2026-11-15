import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { DriverInvitationsService } from './driver-invitations.service';
import { CreateDriverInvitationDto } from './dto/create-driver-invitation.dto';

@Controller('driver-invitations')
export class DriverInvitationsController {
  constructor(
    private readonly driverInvitationsService: DriverInvitationsService,
  ) {}

  @Post()
  create(@Body() createDriverInvitationDto: CreateDriverInvitationDto) {
    return this.driverInvitationsService.create(createDriverInvitationDto);
  }

  @Get()
  findAll() {
    return this.driverInvitationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driverInvitationsService.findOne(id);
  }

  @Put(':id/accept')
  acceptInvitation(@Param('id') id: string) {
    return this.driverInvitationsService.acceptInvitation(id);
  }

  @Put(':id/reject')
  rejectInvitation(@Param('id') id: string) {
    return this.driverInvitationsService.rejectInvitation(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.driverInvitationsService.remove(id);
  }
}
