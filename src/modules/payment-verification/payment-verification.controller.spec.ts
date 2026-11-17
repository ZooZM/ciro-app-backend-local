import { Test, TestingModule } from '@nestjs/testing';
import { PaymentVerificationController } from './payment-verification.controller';
import { PaymentVerificationService } from './payment-verification.service';
import { CreatePaymentVerificationDto } from './dto/create-payment-verification.dto';
import { CreatePumpReadingDto } from './dto/create-pump-reading.dto';
import { FuelTypes } from '../fuel-prices/enum/fuel-types-enum';

describe('PaymentVerificationController', () => {
  let controller: PaymentVerificationController;
  let service: {
    start: jest.Mock;
    get: jest.Mock;
    uploadDashboardBefore: jest.Mock;
    uploadPumpReading: jest.Mock;
    uploadDashboardAfter: jest.Mock;
    complete: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      start: jest.fn(),
      get: jest.fn(),
      uploadDashboardBefore: jest.fn(),
      uploadPumpReading: jest.fn(),
      uploadDashboardAfter: jest.fn(),
      complete: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentVerificationController],
      providers: [{ provide: PaymentVerificationService, useValue: service }],
    }).compile();

    controller = module.get<PaymentVerificationController>(
      PaymentVerificationController,
    );
  });

  it('starts a verification using the authenticated driver', async () => {
    const dto: CreatePaymentVerificationDto = {
      nfcId: 'nfc-tag-1',
      lng: -73.9857,
      lat: 40.7484,
    };
    const request = { user: { userId: '507f1f77bcf86cd799439011' } };
    service.start.mockResolvedValue({ id: 'verification-1' });

    await expect(controller.start(request, dto)).resolves.toEqual({
      id: 'verification-1',
    });
    expect(service.start).toHaveBeenCalledWith(request.user.userId, dto);
  });

  it('passes pump readings and image to the service', async () => {
    const request = { user: { userId: '507f1f77bcf86cd799439011' } };
    const dto: CreatePumpReadingDto = {
      fuelType: FuelTypes.GASOLINE_91,
      liters: 41.2,
      unitPrice: 2.18,
      totalAmount: 89.82,
    };
    const file = { filename: 'pump.jpg' } as Express.Multer.File;
    service.uploadPumpReading.mockResolvedValue({
      status: 'pump-reading-captured',
    });

    await expect(
      controller.uploadPumpReading(request, 'verification-1', dto, file),
    ).resolves.toEqual({ status: 'pump-reading-captured' });
    expect(service.uploadPumpReading).toHaveBeenCalledWith(
      'verification-1',
      request.user.userId,
      dto,
      file,
    );
  });
});
