import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Station, StationDocument } from './schemas/station.schema';
import { Model, Types } from 'mongoose';
import { BaseRepository } from 'src/common/repositories/base.repository';

@Injectable()
export class StationsRepository extends BaseRepository<StationDocument> {
  constructor(
    @InjectModel(Station.name)
    private readonly stationsModel: Model<StationDocument>,
  ) {
    super(stationsModel);
  }

  //   override async create(
  //     createStationDto: CreateStationDto,
  //   ): Promise<StationDocument> {
  //     const { lat, lng, ...rest } = createStationDto;

  // const nearby = await this.stationsModel.exists({
  //   location: {
  //     $geoWithin: {
  //       $centerSphere: [[lng, lat], MIN_DISTANCE_BETWEEN_STATIONS],
  //     },
  //   },
  // });

  // TODO: move it to service
  // if (nearby) {
  //   throw new ConflictException(
  //     `A station already exists within ${MIN_DISTANCE_METERS} meters of this location`,
  //   );
  // }

  //     const location: Location = {
  //       type: 'Point',
  //       coordinates: [lng, lat],
  //     };

  //     return this.stationsModel.create({ ...rest, location });
  //   }

  async existsNear(
    lng: number,
    lat: number,
    radius: number,
  ): Promise<{ _id: Types.ObjectId } | null> {
    return this.stationsModel.exists({
      location: { $geoWithin: { $centerSphere: [[lng, lat], radius] } },
    });
  }

  async remove(id: string) {
    return this.stationsModel.findByIdAndDelete(id);
  }
}
