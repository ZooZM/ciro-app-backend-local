import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CarOwnershipsService } from './car-ownerships.service';
import { CarOwnershipsController } from './car-ownerships.controller';
import {
  CarOwnership,
  CarOwnershipSchema,
} from './schema/car-ownership.schema';
import { CarOwnershipsRepository } from './car-ownerships.repository';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: CarOwnership.name, schema: CarOwnershipSchema },
    ]),
  ],
  controllers: [CarOwnershipsController],
  providers: [CarOwnershipsService, CarOwnershipsRepository],
})
export class CarOwnershipsModule {}
