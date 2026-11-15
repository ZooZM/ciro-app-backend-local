import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CarOwnershipsService } from './car-ownerships.service';
import { CreateCarOwnershipDto } from './dto/create-car-ownership.dto';
import { UpdateCarOwnershipDto } from './dto/update-car-ownership.dto';

@Controller('car-ownerships')
export class CarOwnershipsController {
  constructor(private readonly carOwnershipsService: CarOwnershipsService) {}

  @Post()
  create(@Body() createCarOwnershipDto: CreateCarOwnershipDto) {
    return this.carOwnershipsService.create(createCarOwnershipDto);
  }

  @Get('/owner/:id')
  findAllByOwnerId(@Param('id') id: string) {
    return this.carOwnershipsService.findAllByOwnerId(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCarOwnershipDto: UpdateCarOwnershipDto,
  ) {
    return this.carOwnershipsService.update(id, updateCarOwnershipDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.carOwnershipsService.remove(id);
  }
}
