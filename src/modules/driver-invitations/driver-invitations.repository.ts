import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateDriverInvitationDto } from './dto/create-driver-invitation.dto';
import {
  DriverInvitation,
  DriverInvitationDocument,
} from './schemas/driver-invitation.schema';
import { Car, CarDocument } from '../cars/schemas/car.schema';
import { DriverInvitationStatus } from './enum/driver-invitation-status.enum';

@Injectable()
export class DriverInvitationsRepository {
  constructor(
    @InjectModel(DriverInvitation.name)
    private readonly driverInvitationsModel: Model<DriverInvitationDocument>,
    @InjectModel(Car.name)
    private readonly carsModel: Model<CarDocument>,
  ) {}

  async create(
    createDriverInvitationDto: CreateDriverInvitationDto,
  ): Promise<DriverInvitationDocument> {
    const { owner, driver, car, ...invitation } = createDriverInvitationDto;

    return this.driverInvitationsModel.create({
      ...invitation,
      owner: new Types.ObjectId(owner),
      driver: new Types.ObjectId(driver),
      car: new Types.ObjectId(car),
    });
  }

  async findAll(): Promise<DriverInvitationDocument[]> {
    return this.driverInvitationsModel.find();
  }

  async findById(id: string): Promise<DriverInvitationDocument | null> {
    return this.driverInvitationsModel.findById(id);
  }

  async delete(id: string): Promise<DriverInvitationDocument | null> {
    return this.driverInvitationsModel.findByIdAndDelete(id);
  }

  async acceptInvitation(id: string): Promise<void> {
    const invitation = await this.driverInvitationsModel.findById(id);

    if (!invitation) {
      throw new NotFoundException('Driver invitation not found');
    }

    // $addToSet makes retries safe if the following status update fails.
    const car = await this.carsModel.findByIdAndUpdate(
      invitation.car,
      { $addToSet: { drivers: invitation.driver } },
      { returnDocument: 'after' },
    );

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    const acceptedInvitation =
      await this.driverInvitationsModel.findByIdAndUpdate(
        id,
        { status: DriverInvitationStatus.ACCEPTED },
        { returnDocument: 'after' },
      );

    if (!acceptedInvitation) {
      throw new NotFoundException('Driver invitation not found');
    }
  }

  async rejectInvitation(id: string): Promise<void> {
    await this.driverInvitationsModel.findByIdAndUpdate(id, {
      status: DriverInvitationStatus.REJECTED,
    });
  }

  async exists(id: string): Promise<{ _id: Types.ObjectId } | null> {
    return this.driverInvitationsModel.exists({ _id: id });
  }
}
