import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
} from '@nestjs/common';
import { CarsService } from './cars.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { AdminUpdateCarDto } from './dto/admin-update-car.dto';

@Controller('cars')
export class CarsController {
  constructor(private readonly carsService: CarsService) {}

  @Post()
  async create(@Body() createCarDto: CreateCarDto) {
    return await this.carsService.create(createCarDto);
  }

  @Get('owner/:id')
  async findAllByOwnerId(@Param('id') id: string) {
    return await this.carsService.findAllByOwnerId(id);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return await this.carsService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateCarDto: UpdateCarDto) {
    return await this.carsService.update(id, updateCarDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.carsService.remove(id);
  }

  // ----------------admin----------------

  @Put('admin/:id')
  async adminUpdate(
    @Param('id') id: string,
    @Body() adminUpdateCarDto: AdminUpdateCarDto,
  ) {
    return await this.carsService.adminUpdate(id, adminUpdateCarDto);
  }
}
