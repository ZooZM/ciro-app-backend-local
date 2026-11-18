import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriverInvitationsService } from './driver-invitations.service';
import { DriverInvitationsController } from './driver-invitations.controller';
import {
  DriverInvitation,
  DriverInvitationSchema,
} from './schemas/driver-invitation.schema';
import { DriverInvitationsRepository } from './driver-invitations.repository';
import { CarsModule } from '../cars/cars.module';
import { UsersModule } from '../../users/users.module';
import { Car, CarSchema } from '../cars/schemas/car.schema';

@Module({
  imports: [
    UsersModule,
    CarsModule,
    MongooseModule.forFeature([
      { name: DriverInvitation.name, schema: DriverInvitationSchema },
      { name: Car.name, schema: CarSchema },
    ]),
  ],
  controllers: [DriverInvitationsController],
  providers: [DriverInvitationsService, DriverInvitationsRepository],
})
export class DriverInvitationsModule {}
