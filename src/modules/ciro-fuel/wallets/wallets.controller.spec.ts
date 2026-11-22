import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { WalletCurrency, WalletDocument } from './schemas/wallet.schema';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

describe('WalletsController', () => {
  let controller: WalletsController;
  let walletsService: { getMyWallet: jest.Mock };

  const ownerId = '507f1f77bcf86cd799439011';
  const wallet = {
    ownerId: new Types.ObjectId(ownerId),
    balance: 1250,
    currency: WalletCurrency.SAR,
  } as WalletDocument;

  beforeEach(async () => {
    walletsService = { getMyWallet: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletsController],
      providers: [{ provide: WalletsService, useValue: walletsService }],
    }).compile();

    controller = module.get<WalletsController>(WalletsController);
  });

  it('returns the authenticated owner wallet and spendable balance', async () => {
    walletsService.getMyWallet.mockResolvedValue({
      ...wallet,
      reservedBalance: 100,
    });

    await expect(
      controller.getMyWallet({ user: { userId: ownerId } }),
    ).resolves.toEqual({
      balance: 1250,
      reservedBalance: 100,
      availableBalance: 1150,
      currency: WalletCurrency.SAR,
    });
    expect(walletsService.getMyWallet).toHaveBeenCalledWith(ownerId);
  });
});
