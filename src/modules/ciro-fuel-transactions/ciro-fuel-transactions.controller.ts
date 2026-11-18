import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';

@Controller('ciro-fuel-transactions')
export class CiroFuelTransactionsController {
  constructor(
    private readonly ciroFuelTransactionsService: CiroFuelTransactionsService,
  ) {}

  @Post()
  create(@Body() createCiroFuelTransactionDto: CreateCiroFuelTransactionDto) {
    return this.ciroFuelTransactionsService.create(
      createCiroFuelTransactionDto,
    );
  }

  @Get('owner/:id')
  findAllByOwnerId(@Param('id') id: string) {
    return this.ciroFuelTransactionsService.findAllByOwnerId(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.ciroFuelTransactionsService.findById(id);
  }
}
