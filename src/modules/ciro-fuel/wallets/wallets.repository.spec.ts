import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Wallet,
  WalletDocument,
  WalletReservationStatus,
} from './schemas/wallet.schema';
import { WalletsRepository } from './wallets.repository';

function query<T>(value: T) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

describe('WalletsRepository', () => {
  let repository: WalletsRepository;
  const ownerId = '507f1f77bcf86cd799439011';
  const model = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsRepository,
        { provide: getModelToken(Wallet.name), useValue: model },
      ],
    }).compile();
    repository = module.get<WalletsRepository>(WalletsRepository);
  });

  it('atomically reserves only available funds and records the transaction key', async () => {
    const wallet = {
      paymentReservations: [
        {
          transactionId: 'payment-1',
          amount: 250,
          status: WalletReservationStatus.RESERVED,
        },
      ],
    } as WalletDocument;
    model.findOne.mockReturnValueOnce(query(null));
    model.findOneAndUpdate.mockReturnValueOnce(query(wallet));

    await expect(
      repository.reservePayment(ownerId, 'payment-1', 250),
    ).resolves.toEqual({
      wallet,
      status: WalletReservationStatus.RESERVED,
    });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $expr: {
          $gte: [
            { $subtract: ['$balance', { $ifNull: ['$reservedBalance', 0] }] },
            250,
          ],
        },
      }),
      expect.objectContaining({
        $inc: { reservedBalance: 250 },
        $push: {
          paymentReservations: {
            transactionId: 'payment-1',
            amount: 250,
            status: WalletReservationStatus.RESERVED,
          },
        },
      }),
      expect.any(Object),
    );
  });

  it('does not reserve the same payment twice', async () => {
    const wallet = {
      paymentReservations: [
        {
          transactionId: 'payment-1',
          amount: 250,
          status: WalletReservationStatus.RESERVED,
        },
      ],
    } as WalletDocument;
    model.findOne.mockReturnValueOnce(query(wallet));

    await expect(
      repository.reservePayment(ownerId, 'payment-1', 250),
    ).resolves.toEqual({
      wallet,
      status: WalletReservationStatus.RESERVED,
    });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('settles a reserved payment idempotently', async () => {
    const wallet = {} as WalletDocument;
    model.findOneAndUpdate.mockReturnValueOnce(query(null));
    model.findOne.mockReturnValueOnce(
      query({
        ...wallet,
        paymentReservations: [
          {
            transactionId: 'payment-1',
            amount: 250,
            status: WalletReservationStatus.SETTLED,
          },
        ],
      }),
    );

    await expect(
      repository.settlePayment(ownerId, 'payment-1', 250),
    ).resolves.toBeTruthy();

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $inc: { balance: -250, reservedBalance: -250 },
        $set: {
          'paymentReservations.$.status': WalletReservationStatus.SETTLED,
        },
      }),
      expect.any(Object),
    );
  });
});
