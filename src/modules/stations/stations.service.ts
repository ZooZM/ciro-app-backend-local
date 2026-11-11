import { ConflictException, Injectable } from '@nestjs/common';
import { CreateStationDto } from './dto/create-station.dto';
import { UpdateStationDto } from './dto/update-station.dto';
import { StationsRepository } from './stations.repository';
import { EARTH_RADIUS } from 'src/common/consts/geo.consts';
import { Location } from './schemas/station.schema';

// 10 meters / Earth radius in meters
const MIN_DISTANCE_METERS = 10;
const MIN_DISTANCE_BETWEEN_STATIONS = MIN_DISTANCE_METERS / EARTH_RADIUS;

@Injectable()
export class StationsService {
  constructor(private readonly stationsRepository: StationsRepository) {}

  async create(createStationDto: CreateStationDto) {
    const { lat, lng, ...rest } = createStationDto;

    if (
      await this.stationsRepository.existsNear(
        lng,
        lat,
        MIN_DISTANCE_BETWEEN_STATIONS,
      )
    ) {
      throw new ConflictException(
        `A station already exists within ${MIN_DISTANCE_METERS} meters of this location`,
      );
    }

    const location: Location = {
      type: 'Point',
      coordinates: [lng, lat],
    };

    return this.stationsRepository.create({ ...rest, location });
  }

  findAll() {
    return this.stationsRepository.find({});
  }

  findOne(id: string) {
    return this.stationsRepository.findOne({ _id: id });
  }

  // TODO: what if the location is a bit different
  update(id: string, updateStationDto: UpdateStationDto) {
    return this.stationsRepository.findOneAndUpdate(
      { _id: id },
      updateStationDto,
    );
  }

  remove(id: string) {
    return this.stationsRepository.remove(id);
  }
}
