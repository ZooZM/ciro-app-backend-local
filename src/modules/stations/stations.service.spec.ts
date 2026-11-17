import { Test, TestingModule } from '@nestjs/testing';
import { StationsService } from './stations.service';
import { StationsRepository } from './stations.repository';

describe('StationsService', () => {
  let service: StationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StationsService,
        { provide: StationsRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<StationsService>(StationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
