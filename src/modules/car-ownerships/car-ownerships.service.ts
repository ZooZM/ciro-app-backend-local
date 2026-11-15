import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCarOwnershipDto } from './dto/create-car-ownership.dto';
import { UpdateCarOwnershipDto } from './dto/update-car-ownership.dto';
import { CarOwnershipsRepository } from './car-ownerships.repository';
import { UsersService } from '../users/users.service';
import { CarOwnership } from './schema/car-ownership.schema';

@Injectable()
export class CarOwnershipsService {
  constructor(
    private readonly carOwnershipsRepository: CarOwnershipsRepository,
    private readonly usersService: UsersService,
  ) {}

  async create(
    createCarOwnershipDto: CreateCarOwnershipDto,
  ): Promise<CarOwnership> {
    const existingUser = await this.usersService.exists(
      createCarOwnershipDto.owner,
    );

    if (!existingUser) {
      throw new NotFoundException('Owner not found');
    }

    return this.carOwnershipsRepository.create(createCarOwnershipDto);
  }

  async findAllByOwnerId(ownerId: string): Promise<CarOwnership[]> {
    return this.carOwnershipsRepository.findAllByOwnerId(ownerId);
  }

  async update(
    id: string,
    updateCarOwnershipDto: UpdateCarOwnershipDto,
  ): Promise<CarOwnership> {
    const updatedOwnership = await this.carOwnershipsRepository.update(
      id,
      updateCarOwnershipDto,
    );

    if (updatedOwnership === null) {
      throw new NotFoundException('Ownership not found');
    }

    return updatedOwnership;
  }

  async remove(id: string): Promise<CarOwnership | null> {
    return this.carOwnershipsRepository.delete(id);
  }
}
