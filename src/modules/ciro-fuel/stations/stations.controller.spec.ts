import { Test, TestingModule } from '@nestjs/testing';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';
import { StationsRepository } from './stations.repository';

describe('StationsController', () => {
  let controller: StationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StationsController],
      providers: [
        StationsService,
        { provide: StationsRepository, useValue: {} },
      ],
    }).compile();

    controller = module.get<StationsController>(StationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
