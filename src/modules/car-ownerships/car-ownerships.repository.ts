import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCarOwnershipDto } from './dto/create-car-ownership.dto';
import { UpdateCarOwnershipDto } from './dto/update-car-ownership.dto';
import {
  CarOwnership,
  CarOwnershipDocument,
} from './schema/car-ownership.schema';

@Injectable()
export class CarOwnershipsRepository {
  constructor(
    @InjectModel(CarOwnership.name)
    private readonly carOwnershipsModel: Model<CarOwnershipDocument>,
  ) {}

  async create(
    createCarOwnershipDto: CreateCarOwnershipDto,
  ): Promise<CarOwnershipDocument> {
    const { owner, car, ...ownership } = createCarOwnershipDto;

    return this.carOwnershipsModel.create({
      ...ownership,
      owner: new Types.ObjectId(owner),
      car: new Types.ObjectId(car),
    });
  }

  async update(
    id: string,
    updateCarOwnershipDto: UpdateCarOwnershipDto,
  ): Promise<CarOwnershipDocument | null> {
    return this.carOwnershipsModel.findByIdAndUpdate(
      id,
      updateCarOwnershipDto,
      {
        new: true,
        runValidators: true,
      },
    );
  }

  async delete(id: string): Promise<CarOwnershipDocument | null> {
    return this.carOwnershipsModel.findByIdAndDelete(id);
  }

  async findAllByOwnerId(ownerId: string): Promise<CarOwnershipDocument[]> {
    return this.carOwnershipsModel.find({ owner: ownerId });
  }
}
