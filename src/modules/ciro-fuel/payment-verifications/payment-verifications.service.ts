import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { access, unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import { Types } from 'mongoose';
import { CreatePaymentVerificationDto } from './dto/create-payment-verification.dto';
import { CreatePumpReadingDto } from './dto/create-pump-reading.dto';
import { PaymentVerificationsRepository } from './payment-verifications.repository';
import { PaymentVerificationRejectionReason } from './enum/payment-verification-rejection-reason.enum';
import { PaymentVerificationStatus } from './enum/payment-verification-status.enum';
import {
  IMAGE_CONTENT_TYPES,
  PAYMENT_VERIFICATION_SESSION_TTL_MS,
  PAYMENT_VERIFICATION_UPLOAD_DIR,
} from './consts/payment-verification.constants';
import { hasValidImageSignature } from './utils/image-signature.util';
import { toCents, toMilliUnits, totalCents } from './utils/money.util';
import type {
  PaymentVerification,
  PaymentVerificationDocument,
} from './schemas/payment-verification.schema';
import { CarsService } from '../cars/cars.service';
import { FuelPricesService } from '../fuel-prices/fuel-prices.service';
import { StationsService } from '../stations/stations.service';

const IMAGE_FIELDS = {
  'dashboard-before': 'carDashboardImageBefore',
  pump: 'pumper_image',
  'dashboard-after': 'carDashboardImageAfter',
} as const;
type ImageKind = keyof typeof IMAGE_FIELDS;

function referencedId(value: unknown): string {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (
    value &&
    typeof value === 'object' &&
    '_id' in value &&
    value._id instanceof Types.ObjectId
  ) {
    return value._id.toHexString();
  }
  throw new TypeError('Expected an ObjectId reference');
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class PaymentVerificationsService {
  constructor(
    private readonly paymentVerificationsRepository: PaymentVerificationsRepository,
    private readonly carsService: CarsService,
    private readonly stationsService: StationsService,
    private readonly fuelPricesService: FuelPricesService,
  ) {}

  async start(
    driverId: string,
    dto: CreatePaymentVerificationDto,
  ): Promise<PaymentVerificationDocument> {
    if (!Types.ObjectId.isValid(driverId)) {
      throw new BadRequestException('Invalid authenticated driver id');
    }

    const [car, station] = await Promise.all([
      this.carsService.findActiveByNfcId(dto.nfcId),
      this.stationsService.findNearbyStation(dto.lng, dto.lat),
    ]);

    if (!car) throw new NotFoundException('Active car not found for NFC tag');
    if (!station) throw new NotFoundException('Station not found');
    if ((station as { isActive?: boolean }).isActive === false) {
      throw new ConflictException('Station is not active');
    }

    // Authorize first so unrelated drivers learn nothing about the car's setup.
    const isOwner = referencedId(car.owner) === driverId;
    const isAssignedDriver = (car.drivers ?? []).some(
      (driver) => referencedId(driver) === driverId,
    );
    if (!isOwner && !isAssignedDriver) {
      throw new ForbiddenException('Driver is not assigned to this car');
    }

    // Fail now, not after the driver has completed every step.
    if (!car.fuelType) {
      throw new ConflictException('Car fuel type is not configured');
    }
    if (!(car.tankCapacity > 0)) {
      throw new ConflictException('Car tank capacity is not configured');
    }

    // Free the car's slot if a previous session was abandoned.
    await this.paymentVerificationsRepository.expireStaleForCar(
      car._id,
      this.cutoff(),
    );

    try {
      return await this.paymentVerificationsRepository.create(
        car._id,
        driverId,
        station._id,
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'This car already has an active verification session',
        );
      }
      throw error;
    }
  }

  async get(
    id: string,
    driverId: string,
  ): Promise<PaymentVerificationDocument> {
    this.validateId(id);
    const verification =
      await this.paymentVerificationsRepository.findByIdForDriver(id, driverId);
    if (!verification) {
      throw new NotFoundException('Payment verification not found');
    }
    return verification;
  }

  /**
   * Throws unless the session belongs to the driver, is at `expected`, and has
   * not expired. Used by the pre-upload guard and by failed-transition handling.
   */
  async assertStage(
    id: string,
    driverId: string,
    expected: PaymentVerificationStatus,
  ): Promise<PaymentVerificationDocument> {
    const verification = await this.get(id, driverId);

    if (
      verification.status === PaymentVerificationStatus.ACCEPTED ||
      verification.status === PaymentVerificationStatus.REJECTED
    ) {
      throw new ConflictException('Payment verification is already complete');
    }
    if (
      verification.status === PaymentVerificationStatus.EXPIRED ||
      this.isExpired(verification)
    ) {
      throw new GoneException('Payment verification session expired');
    }
    if (verification.status !== expected) {
      throw new ConflictException('Payment verification step is out of order');
    }
    return verification;
  }

  async uploadDashboardBefore(
    id: string,
    driverId: string,
    file?: Express.Multer.File,
  ): Promise<PaymentVerificationDocument> {
    return this.withUploadedImage(file, (url) =>
      this.advance(id, driverId, PaymentVerificationStatus.NFC_SCANNED, {
        carDashboardImageBefore: url,
        status: PaymentVerificationStatus.DASHBOARD_BEFORE_FUELING,
      }),
    );
  }

  async uploadPumpReading(
    id: string,
    driverId: string,
    dto: CreatePumpReadingDto,
    file?: Express.Multer.File,
  ): Promise<PaymentVerificationDocument> {
    return this.withUploadedImage(file, (url) =>
      this.advance(
        id,
        driverId,
        PaymentVerificationStatus.DASHBOARD_BEFORE_FUELING,
        {
          pumper_image: url,
          fuelType: dto.fuelType,
          liters: dto.liters,
          unitPrice: dto.unitPrice,
          totalAmount: dto.totalAmount,
          status: PaymentVerificationStatus.PUMP_READING_CAPTURED,
        },
      ),
    );
  }

  async uploadDashboardAfter(
    id: string,
    driverId: string,
    file?: Express.Multer.File,
  ): Promise<PaymentVerificationDocument> {
    return this.withUploadedImage(file, (url) =>
      this.advance(
        id,
        driverId,
        PaymentVerificationStatus.PUMP_READING_CAPTURED,
        {
          carDashboardImageAfter: url,
          status: PaymentVerificationStatus.DASHBOARD_AFTER_FUELING,
        },
      ),
    );
  }

  async complete(
    id: string,
    driverId: string,
  ): Promise<PaymentVerificationDocument> {
    const verification = await this.assertStage(
      id,
      driverId,
      PaymentVerificationStatus.DASHBOARD_AFTER_FUELING,
    );

    if (
      !verification.carDashboardImageBefore ||
      !verification.pumper_image ||
      !verification.carDashboardImageAfter ||
      !verification.fuelType ||
      verification.liters === undefined ||
      verification.unitPrice === undefined ||
      verification.totalAmount === undefined
    ) {
      throw new ConflictException('Required verification evidence is missing');
    }

    const [car, station, prices] = await Promise.all([
      this.carsService.findById(referencedId(verification.car)),
      this.stationsService.findById(referencedId(verification.station)),
      this.fuelPricesService.getCurrent(),
    ]);
    if (!car) throw new NotFoundException('Car not found');
    if (!station) throw new NotFoundException('Station not found');
    if (!prices) {
      throw new ServiceUnavailableException('Fuel prices are unavailable');
    }
    if (!(car.tankCapacity > 0)) {
      throw new ConflictException('Car tank capacity is not configured');
    }

    const authoritativeUnitPrice = prices[verification.fuelType];
    if (
      !Number.isFinite(authoritativeUnitPrice) ||
      authoritativeUnitPrice <= 0
    ) {
      throw new ServiceUnavailableException(
        'Fuel price is not configured for this fuel type',
      );
    }

    const stationFuelTypes = station.fuelTypes ?? [];
    const calculatedTotalCents = totalCents(
      verification.liters,
      authoritativeUnitPrice,
    );
    const calculatedTotalAmount = calculatedTotalCents / 100;
    const rejectionReasons: PaymentVerificationRejectionReason[] = [];

    if (verification.fuelType !== car.fuelType) {
      rejectionReasons.push(
        PaymentVerificationRejectionReason.CAR_FUEL_TYPE_MISMATCH,
      );
    }
    if (!stationFuelTypes.includes(verification.fuelType)) {
      rejectionReasons.push(
        PaymentVerificationRejectionReason.STATION_FUEL_TYPE_UNSUPPORTED,
      );
    }
    if (verification.liters > car.tankCapacity) {
      rejectionReasons.push(
        PaymentVerificationRejectionReason.FUEL_VOLUME_EXCEEDS_TANK_CAPACITY,
      );
    }
    if (
      toMilliUnits(verification.unitPrice) !==
      toMilliUnits(authoritativeUnitPrice)
    ) {
      rejectionReasons.push(
        PaymentVerificationRejectionReason.UNIT_PRICE_MISMATCH,
      );
    }
    if (toCents(verification.totalAmount) !== calculatedTotalCents) {
      rejectionReasons.push(
        PaymentVerificationRejectionReason.TOTAL_AMOUNT_MISMATCH,
      );
    }

    const updated =
      await this.paymentVerificationsRepository.updateForDriverAtStatus(
        id,
        driverId,
        PaymentVerificationStatus.DASHBOARD_AFTER_FUELING,
        {
          authoritativeUnitPrice,
          calculatedTotalAmount,
          rejectionReasons,
          carFuelTypeSnapshot: car.fuelType,
          carTankCapacitySnapshot: car.tankCapacity,
          stationFuelTypesSnapshot: [...stationFuelTypes],
          completedAt: new Date(),
          status: rejectionReasons.length
            ? PaymentVerificationStatus.REJECTED
            : PaymentVerificationStatus.ACCEPTED,
        },
        this.cutoff(),
      );
    if (updated) return updated;

    return this.failedTransition(
      id,
      driverId,
      PaymentVerificationStatus.DASHBOARD_AFTER_FUELING,
    );
  }

  /** Authenticated image access; resolves only files belonging to the caller's session. */
  async getImage(
    id: string,
    driverId: string,
    kind: string,
  ): Promise<{ path: string; contentType: string }> {
    if (!Object.prototype.hasOwnProperty.call(IMAGE_FIELDS, kind)) {
      throw new BadRequestException('Unknown image type');
    }
    const verification = await this.get(id, driverId);
    const url = verification[IMAGE_FIELDS[kind as ImageKind]];
    if (!url) throw new NotFoundException('Image has not been uploaded yet');

    const filename = basename(url); // strips any path components
    const contentType = IMAGE_CONTENT_TYPES[extname(filename).toLowerCase()];
    const path = join(PAYMENT_VERIFICATION_UPLOAD_DIR, filename);
    if (!contentType) throw new NotFoundException('Image not found');
    try {
      await access(path);
    } catch {
      throw new NotFoundException('Image not found');
    }
    return { path, contentType };
  }

  private async advance(
    id: string,
    driverId: string,
    expectedStatus: PaymentVerificationStatus,
    changes: Partial<PaymentVerification>,
  ): Promise<PaymentVerificationDocument> {
    this.validateId(id);
    const updated =
      await this.paymentVerificationsRepository.updateForDriverAtStatus(
        id,
        driverId,
        expectedStatus,
        changes,
        this.cutoff(),
      );
    if (updated) return updated;
    return this.failedTransition(id, driverId, expectedStatus);
  }

  /** Explains why an atomic transition matched nothing. Always throws. */
  private async failedTransition(
    id: string,
    driverId: string,
    expected: PaymentVerificationStatus,
  ): Promise<never> {
    await this.assertStage(id, driverId, expected);
    throw new ConflictException('Payment verification changed; retry');
  }

  /**
   * Validates the uploaded file's contents, runs the handler, and deletes the
   * file from disk if anything fails so no orphaned evidence is left behind.
   * (UploadCleanupInterceptor covers failures that happen before this runs,
   * such as body validation; deleting twice is harmless.)
   */
  private async withUploadedImage(
    file: Express.Multer.File | undefined,
    handler: (url: string) => Promise<PaymentVerificationDocument>,
  ): Promise<PaymentVerificationDocument> {
    this.requireImage(file);
    try {
      const valid = await hasValidImageSignature(file.path, file.mimetype);
      if (!valid) {
        throw new BadRequestException(
          'File content does not match a supported image type',
        );
      }
      return await handler(this.imageUrl(file));
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  /** Sessions idle for longer than the TTL are expired. */
  private cutoff(): Date {
    return new Date(Date.now() - PAYMENT_VERIFICATION_SESSION_TTL_MS);
  }

  private isExpired(verification: PaymentVerificationDocument): boolean {
    return verification.updatedAt
      ? verification.updatedAt.getTime() < this.cutoff().getTime()
      : false;
  }

  private validateId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid payment verification id');
    }
  }

  private requireImage(
    file?: Express.Multer.File,
  ): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('Image file is required');
  }

  private imageUrl(file: Express.Multer.File): string {
    return `/uploads/payment-verification/${file.filename}`;
  }
}
