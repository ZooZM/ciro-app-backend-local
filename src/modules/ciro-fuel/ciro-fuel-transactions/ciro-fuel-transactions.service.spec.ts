import { Test, TestingModule } from '@nestjs/testing';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';
import { FuelTypes } from '../fuel-prices/enum/fuel-types-enum';

describe('CiroFuelTransactionsService', () => {
  let service: CiroFuelTransactionsService;
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findAllByOwnerId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiroFuelTransactionsService,
        { provide: CiroFuelTransactionsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<CiroFuelTransactionsService>(
      CiroFuelTransactionsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a transaction through the repository', async () => {
    const dto: CreateCiroFuelTransactionDto = {
      amountPaid: 20,
      amountRefueled: 5,
      station: '507f1f77bcf86cd799439011',
      car: '507f1f77bcf86cd799439012',
      driver: '507f1f77bcf86cd799439013',
      owner: '507f1f77bcf86cd799439014',
      paymentVerification: '507f1f77bcf86cd799439015',
      fuelType: FuelTypes.GASOLINE_91,
    };
    const transaction = { _id: 'transaction-id' };
    repository.create.mockResolvedValue(transaction);

    await expect(service.create(dto)).resolves.toBe(transaction);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('finds a transaction by ID through the repository', async () => {
    const transaction = { _id: 'transaction-id' };
    repository.findById.mockResolvedValue(transaction);

    await expect(service.findById('transaction-id')).resolves.toBe(transaction);
    expect(repository.findById).toHaveBeenCalledWith('transaction-id');
  });

  it('finds transactions by owner through the repository', async () => {
    const ownerId = '507f1f77bcf86cd799439014';
    const transactions = [{ _id: 'transaction-id' }];
    repository.findAllByOwnerId.mockResolvedValue(transactions);

    await expect(service.findAllByOwnerId(ownerId)).resolves.toBe(transactions);
    expect(repository.findAllByOwnerId).toHaveBeenCalledWith(ownerId);
  });
});
