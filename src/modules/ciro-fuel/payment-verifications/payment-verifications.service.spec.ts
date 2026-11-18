import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { FuelTypes } from '../fuel-prices/enum/fuel-types-enum';
import { CreatePaymentVerificationDto } from './dto/create-payment-verification.dto';
import { CreatePumpReadingDto } from './dto/create-pump-reading.dto';
import { PaymentVerificationRejectionReason } from './enum/payment-verification-rejection-reason.enum';
import { PaymentVerificationStatus } from './enum/payment-verification-status.enum';
import { PaymentVerificationsRepository } from './payment-verifications.repository';
import { PaymentVerificationsService } from './payment-verifications.service';
import { CarsService } from '../cars/cars.service';
import { FuelPricesService } from '../fuel-prices/fuel-prices.service';
import { StationsService } from '../stations/stations.service';
import type {
  PaymentVerification,
  PaymentVerificationDocument,
} from './schemas/payment-verification.schema';

jest.mock('./utils/image-signature.util', () => ({
  hasValidImageSignature: jest.fn().mockResolvedValue(true),
}));

describe('PaymentVerificationsService', () => {
  let service: PaymentVerificationsService;
  let repository: Record<string, jest.Mock>;
  let carsService: {
    findActiveByNfcId: jest.Mock;
    findById: jest.Mock;
  };
  let stationsService: { findNearbyStation: jest.Mock; findById: jest.Mock };
  let fuelPricesService: { getCurrent: jest.Mock };
  let lastUpdate: Partial<PaymentVerification> | undefined;

  const driverId = '507f1f77bcf86cd799439011';
  const carId = new Types.ObjectId('507f1f77bcf86cd799439013');
  const stationId = '507f1f77bcf86cd799439012';
  const verificationId = '507f1f77bcf86cd799439014';
  const file = { filename: 'image.jpg' } as Express.Multer.File;
  const startDto: CreatePaymentVerificationDto = {
    nfcId: 'nfc-tag-1',
    lng: -73.9857,
    lat: 40.7484,
  };
  const pumpDto: CreatePumpReadingDto = {
    fuelType: FuelTypes.GASOLINE_91,
    liters: 41.2,
    unitPrice: 2.18,
    totalAmount: 89.82,
  };
  const car = {
    _id: carId,
    owner: new Types.ObjectId(driverId),
    drivers: [],
    fuelType: FuelTypes.GASOLINE_91,
    tankCapacity: 60,
  };
  const station = {
    _id: new Types.ObjectId(stationId),
    fuelTypes: [FuelTypes.GASOLINE_91],
  };

  const verification = (
    status: PaymentVerificationStatus,
    changes: Partial<PaymentVerification> = {},
  ): PaymentVerificationDocument =>
    ({
      _id: new Types.ObjectId(verificationId),
      car: carId,
      driver: new Types.ObjectId(driverId),
      station: new Types.ObjectId(stationId),
      status,
      carDashboardImageBefore: '/uploads/payment-verification/before.jpg',
      pumper_image: '/uploads/payment-verification/pump.jpg',
      carDashboardImageAfter: '/uploads/payment-verification/after.jpg',
      fuelType: FuelTypes.GASOLINE_91,
      liters: 41.2,
      unitPrice: 2.18,
      totalAmount: 89.82,
      ...changes,
    }) as PaymentVerificationDocument;

  beforeEach(async () => {
    lastUpdate = undefined;
    repository = {
      expireStaleForCar: jest.fn().mockResolvedValue(undefined),
      create: jest
        .fn()
        .mockResolvedValue(verification(PaymentVerificationStatus.NFC_SCANNED)),
      findByIdForDriver: jest
        .fn()
        .mockResolvedValue(
          verification(PaymentVerificationStatus.DASHBOARD_AFTER_FUELING),
        ),
      findById: jest.fn(),
      updateForDriverAtStatus: jest
        .fn()
        .mockImplementation(
          (
            _id: string,
            _driverId: string,
            expectedStatus: PaymentVerificationStatus,
            changes: Partial<PaymentVerification>,
          ) => {
            lastUpdate = changes;
            return Promise.resolve(
              verification(changes.status ?? expectedStatus, changes),
            );
          },
        ),
    };
    carsService = {
      findActiveByNfcId: jest.fn().mockResolvedValue(car),
      findById: jest.fn().mockResolvedValue(car),
    };
    stationsService = {
      findNearbyStation: jest.fn().mockResolvedValue(station),
      findById: jest.fn().mockResolvedValue(station),
    };
    fuelPricesService = {
      getCurrent: jest.fn().mockResolvedValue({
        gasoline_91: 2.18,
        gasoline_95: 2.33,
        gasoline_98: 2.5,
        diesel: 1.15,
        kerosene: 1.33,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentVerificationsService,
        { provide: PaymentVerificationsRepository, useValue: repository },
        { provide: CarsService, useValue: carsService },
        { provide: StationsService, useValue: stationsService },
        { provide: FuelPricesService, useValue: fuelPricesService },
      ],
    }).compile();

    service = module.get<PaymentVerificationsService>(
      PaymentVerificationsService,
    );
  });

  it('starts a verification for the authenticated car owner', async () => {
    await service.start(driverId, startDto);

    expect(stationsService.findNearbyStation).toHaveBeenCalledWith(
      startDto.lng,
      startDto.lat,
    );
    expect(stationsService.findById).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      carId,
      driverId,
      station._id,
    );
  });

  it('allows a driver assigned to the scanned car', async () => {
    carsService.findActiveByNfcId.mockResolvedValue({
      ...car,
      owner: new Types.ObjectId('507f1f77bcf86cd799439015'),
      drivers: [new Types.ObjectId(driverId)],
    });

    await expect(service.start(driverId, startDto)).resolves.toBeDefined();
  });

  it('rejects a driver not associated with the scanned car', async () => {
    carsService.findActiveByNfcId.mockResolvedValue({
      ...car,
      owner: new Types.ObjectId('507f1f77bcf86cd799439015'),
      drivers: [],
    });

    await expect(service.start(driverId, startDto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects NFC tags without an active car', async () => {
    carsService.findActiveByNfcId.mockResolvedValue(null);

    await expect(service.start(driverId, startDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires the dashboard-before photo before accepting a pump reading', async () => {
    repository.updateForDriverAtStatus.mockResolvedValue(null);
    repository.findByIdForDriver.mockResolvedValue(
      verification(PaymentVerificationStatus.NFC_SCANNED),
    );

    await expect(
      service.uploadPumpReading(verificationId, driverId, pumpDto, file),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires an image for each evidence upload', async () => {
    await expect(
      service.uploadDashboardBefore(verificationId, driverId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateForDriverAtStatus).not.toHaveBeenCalled();
  });

  it('accepts a complete verification when pump values match the car, station, and current price', async () => {
    await service.complete(verificationId, driverId);

    expect(repository.updateForDriverAtStatus).toHaveBeenCalledWith(
      verificationId,
      driverId,
      PaymentVerificationStatus.DASHBOARD_AFTER_FUELING,
      expect.objectContaining({
        authoritativeUnitPrice: 2.18,
        calculatedTotalAmount: 89.82,
        rejectionReasons: [],
        status: PaymentVerificationStatus.ACCEPTED,
      }),
      expect.any(Date),
    );
  });

  it('rejects mismatched unit price and total instead of accepting them', async () => {
    repository.findByIdForDriver.mockResolvedValue(
      verification(PaymentVerificationStatus.DASHBOARD_AFTER_FUELING, {
        unitPrice: 2.19,
        totalAmount: 89.83,
      }),
    );

    await service.complete(verificationId, driverId);

    expect(lastUpdate?.status).toBe(PaymentVerificationStatus.REJECTED);
    expect(lastUpdate?.rejectionReasons).toEqual([
      PaymentVerificationRejectionReason.UNIT_PRICE_MISMATCH,
      PaymentVerificationRejectionReason.TOTAL_AMOUNT_MISMATCH,
    ]);
  });

  it('rejects fuel not supported by the car or station and volume above tank capacity', async () => {
    repository.findByIdForDriver.mockResolvedValue(
      verification(PaymentVerificationStatus.DASHBOARD_AFTER_FUELING, {
        fuelType: FuelTypes.DIESEL,
        liters: 61,
        unitPrice: 1.15,
        totalAmount: 70.15,
      }),
    );

    await service.complete(verificationId, driverId);

    expect(lastUpdate?.status).toBe(PaymentVerificationStatus.REJECTED);
    expect(lastUpdate?.rejectionReasons).toEqual(
      expect.arrayContaining([
        PaymentVerificationRejectionReason.CAR_FUEL_TYPE_MISMATCH,
        PaymentVerificationRejectionReason.STATION_FUEL_TYPE_UNSUPPORTED,
        PaymentVerificationRejectionReason.FUEL_VOLUME_EXCEEDS_TANK_CAPACITY,
      ]),
    );
  });

  it('does not finalize before all workflow stages are complete', async () => {
    repository.findByIdForDriver.mockResolvedValue(
      verification(PaymentVerificationStatus.PUMP_READING_CAPTURED),
    );

    await expect(
      service.complete(verificationId, driverId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fuelPricesService.getCurrent).not.toHaveBeenCalled();
    expect(repository.updateForDriverAtStatus).not.toHaveBeenCalled();
  });

  it('fails explicitly when the current fuel price is unavailable', async () => {
    fuelPricesService.getCurrent.mockResolvedValue(null);

    await expect(
      service.complete(verificationId, driverId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.updateForDriverAtStatus).not.toHaveBeenCalled();
  });
});
