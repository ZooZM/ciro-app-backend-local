import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { CarsRepository } from './cars.repository';
import { UsersService } from '../users/users.service';
import { Car } from './schemas/car.schema';
import { AdminUpdateCarDto } from './dto/admin-update-car.dto';

@Injectable()
export class CarsService {
  constructor(
    private readonly carsRepository: CarsRepository,
    private readonly usersService: UsersService,
  ) {}

  async create(createCarDto: CreateCarDto): Promise<Car> {
    const ownerExists = await this.usersService.exists(createCarDto.owner);

    if (!ownerExists) {
      throw new NotFoundException('Owner not found');
    }

    return this.carsRepository.create(createCarDto);
  }

  async findAllByOwnerId(id: string): Promise<Car[]> {
    const ownerExists = await this.usersService.exists(id);

    if (!ownerExists) {
      throw new NotFoundException('Owner not found');
    }

    return this.carsRepository.findAllByOwnerId(id);
  }

  async findById(id: string): Promise<Car> {
    const car = await this.carsRepository.findById(id);

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    return car;
  }

  async exists(id: string): Promise<boolean> {
    return !!(await this.carsRepository.exists(id));
  }

  async update(id: string, updateCarDto: UpdateCarDto): Promise<Car> {
    const car = await this.carsRepository.update(id, updateCarDto);

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    return car;
  }

  async remove(id: string): Promise<Car> {
    const car = await this.carsRepository.remove(id);

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    return car;
  }

  // ----------------admin----------------

  async adminUpdate(
    id: string,
    adminUpdateCarDto: AdminUpdateCarDto,
  ): Promise<Car> {
    const car = await this.carsRepository.adminUpdate(id, adminUpdateCarDto);

    if (!car) {
      throw new NotFoundException('Car not found');
    }

    return car;
  }
}
