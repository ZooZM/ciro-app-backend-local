import { Test, TestingModule } from '@nestjs/testing';
import { CiroFuelTransactionsController } from './ciro-fuel-transactions.controller';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';

describe('CiroFuelTransactionsController', () => {
  let controller: CiroFuelTransactionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CiroFuelTransactionsController],
      providers: [
        {
          provide: CiroFuelTransactionsService,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findAllByOwnerId: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CiroFuelTransactionsController>(
      CiroFuelTransactionsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
