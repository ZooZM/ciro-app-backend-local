import { Module } from '@nestjs/common';
import { CarsService } from './cars.service';
import { CarsController } from './cars.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Car, CarSchema } from './schemas/car.schema';
import { UsersModule } from '../users/users.module';
import { CarsRepository } from './cars.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Car.name, schema: CarSchema }]),
    UsersModule,
  ],
  controllers: [CarsController],
  providers: [CarsService, CarsRepository],
})
export class CarsModule {}
