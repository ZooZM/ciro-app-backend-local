import { Controller, Get, Param } from '@nestjs/common';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';

@Controller('ciro-fuel-transactions')
export class CiroFuelTransactionsController {
  constructor(
    private readonly ciroFuelTransactionsService: CiroFuelTransactionsService,
  ) {}

  @Get('owner/:id')
  findAllByOwnerId(@Param('id') id: string) {
    return this.ciroFuelTransactionsService.findAllByOwnerId(id);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.ciroFuelTransactionsService.findById(id);
  }
}
