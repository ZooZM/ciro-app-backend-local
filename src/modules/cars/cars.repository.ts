import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Car, CarDocument } from './schemas/car.schema';
import { Model, Types } from 'mongoose';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { AdminUpdateCarDto } from './dto/admin-update-car.dto';

@Injectable()
export class CarsRepository {
  constructor(
    @InjectModel(Car.name) private readonly carsModel: Model<CarDocument>,
  ) {}

  async create(createCarDto: CreateCarDto): Promise<Car> {
    const owner = new Types.ObjectId(createCarDto.owner);

    return await this.carsModel.create({ ...createCarDto, owner });
  }

  async update(id: string, updateCarDto: UpdateCarDto): Promise<Car | null> {
    return this.carsModel.findByIdAndUpdate(id, updateCarDto, {
      runValidators: true,
      returnDocument: 'after',
    });
  }

  async findById(id: string): Promise<Car | null> {
    return this.carsModel.findById(id);
  }

  async findAllByOwnerId(id: string): Promise<Car[]> {
    return this.carsModel.find({ owner: id });
  }

  async exists(id: string): Promise<{ _id: Types.ObjectId } | null> {
    return this.carsModel.exists({ _id: id });
  }

  async remove(id: string): Promise<Car | null> {
    return this.carsModel.findByIdAndDelete(id);
  }

  // ----------------admin----------------

  async adminUpdate(
    id: string,
    adminUpdateCarDto: AdminUpdateCarDto,
  ): Promise<Car | null> {
    return this.carsModel.findByIdAndUpdate(id, adminUpdateCarDto, {
      runValidators: true,
      returnDocument: 'after',
    });
  }
}
