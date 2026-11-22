import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';
import { FuelTypes } from '../fuel-prices/enum/fuel-types-enum';
import { TransactionsService } from '../../transactions/transactions.service';
import {
  CIRO_FUEL_PAYMENT_JOB,
  CIRO_FUEL_PAYMENT_QUEUE,
} from './ciro-fuel-payment.constants';

describe('CiroFuelTransactionsService', () => {
  let service: CiroFuelTransactionsService;
  const transactionsService = { create: jest.fn() };
  const paymentQueue = { add: jest.fn() };
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findAllByOwnerId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    transactionsService.create.mockResolvedValue({ _id: 'generic-id' });
    paymentQueue.add.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiroFuelTransactionsService,
        { provide: CiroFuelTransactionsRepository, useValue: repository },
        { provide: TransactionsService, useValue: transactionsService },
        {
          provide: getQueueToken(CIRO_FUEL_PAYMENT_QUEUE),
          useValue: paymentQueue,
        },
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
    const fuelTransaction = { _id: 'transaction-id' };
    const transaction = { _id: 'generic-id' };
    repository.create.mockResolvedValue(fuelTransaction);
    transactionsService.create.mockResolvedValue(transaction);

    await expect(service.create(dto)).resolves.toBe(transaction);
    expect(repository.create).toHaveBeenCalledWith(dto);
    expect(transactionsService.create).toHaveBeenCalledWith({
      type: 'CiroFuelTransaction',
      transaction: fuelTransaction._id,
    });
    expect(paymentQueue.add).toHaveBeenCalledWith(
      CIRO_FUEL_PAYMENT_JOB,
      { transactionId: fuelTransaction._id },
      expect.objectContaining({
        jobId: `ciro-fuel-payment-${fuelTransaction._id}`,
      }),
    );
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
