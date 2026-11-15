import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateDriverInvitationDto } from './dto/create-driver-invitation.dto';
import { DriverInvitationsRepository } from './driver-invitations.repository';
import { DriverInvitationDocument } from './schemas/driver-invitation.schema';
import { UsersService } from '../users/users.service';
import { CarsService } from '../cars/cars.service';

@Injectable()
export class DriverInvitationsService {
  constructor(
    private readonly driverInvitationsRepository: DriverInvitationsRepository,
    private readonly usersService: UsersService,
    private readonly carsService: CarsService,
  ) {}

  async create(
    createDriverInvitationDto: CreateDriverInvitationDto,
  ): Promise<DriverInvitationDocument> {
    const existingOwner = await this.usersService.exists(
      createDriverInvitationDto.owner,
    );
    if (!existingOwner) {
      throw new NotFoundException('Owner not found');
    }

    const existingDriver = await this.usersService.exists(
      createDriverInvitationDto.driver,
    );
    if (!existingDriver) {
      throw new NotFoundException('Driver not found');
    }

    const existingCar = await this.carsService.exists(
      createDriverInvitationDto.car,
    );
    if (!existingCar) {
      throw new NotFoundException('Car not found');
    }

    return this.driverInvitationsRepository.create(createDriverInvitationDto);
  }

  findAll(): Promise<DriverInvitationDocument[]> {
    return this.driverInvitationsRepository.findAll();
  }

  async findOne(id: string): Promise<DriverInvitationDocument> {
    const invitation = await this.driverInvitationsRepository.findById(id);

    if (!invitation) {
      throw new NotFoundException('Driver invitation not found');
    }

    return invitation;
  }

  async remove(id: string): Promise<DriverInvitationDocument> {
    const invitation = await this.driverInvitationsRepository.delete(id);

    if (!invitation) {
      throw new NotFoundException('Driver invitation not found');
    }

    return invitation;
  }

  async acceptInvitation(id: string): Promise<void> {
    const existsingInvitation =
      !!(await this.driverInvitationsRepository.exists(id));

    if (!existsingInvitation) {
      throw new NotFoundException('Driver invitation not found');
    }

    await this.driverInvitationsRepository.acceptInvitation(id);
  }

  async rejectInvitation(id: string): Promise<void> {
    const existsingInvitation =
      !!(await this.driverInvitationsRepository.exists(id));

    if (!existsingInvitation) {
      throw new NotFoundException('Driver invitation not found');
    }

    await this.driverInvitationsRepository.rejectInvitation(id);
  }
}
