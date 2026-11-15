import { Test, TestingModule } from '@nestjs/testing';
import { DriverInvitationsController } from './driver-invitations.controller';
import { DriverInvitationsService } from './driver-invitations.service';
import { CreateDriverInvitationDto } from './dto/create-driver-invitation.dto';

describe('DriverInvitationsController', () => {
  let controller: DriverInvitationsController;
  let driverInvitationsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    acceptInvitation: jest.Mock;
    rejectInvitation: jest.Mock;
    remove: jest.Mock;
  };

  const id = '507f1f77bcf86cd799439011';
  const invitation = { _id: id };
  const createDto: CreateDriverInvitationDto = {
    owner: id,
    driver: '507f191e810c19729de860ea',
    car: '507f1f77bcf86cd799439012',
  };

  beforeEach(async () => {
    driverInvitationsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      acceptInvitation: jest.fn(),
      rejectInvitation: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverInvitationsController],
      providers: [
        {
          provide: DriverInvitationsService,
          useValue: driverInvitationsService,
        },
      ],
    }).compile();

    controller = module.get<DriverInvitationsController>(
      DriverInvitationsController,
    );
  });

  it('creates an invitation', async () => {
    driverInvitationsService.create.mockResolvedValue(invitation);

    await expect(controller.create(createDto)).resolves.toBe(invitation);
    expect(driverInvitationsService.create).toHaveBeenCalledWith(createDto);
  });

  it('lists invitations', async () => {
    driverInvitationsService.findAll.mockResolvedValue([invitation]);

    await expect(controller.findAll()).resolves.toEqual([invitation]);
    expect(driverInvitationsService.findAll).toHaveBeenCalled();
  });

  it('gets an invitation by id', async () => {
    driverInvitationsService.findOne.mockResolvedValue(invitation);

    await expect(controller.findOne(id)).resolves.toBe(invitation);
    expect(driverInvitationsService.findOne).toHaveBeenCalledWith(id);
  });

  it('accepts an invitation by id', async () => {
    driverInvitationsService.acceptInvitation.mockResolvedValue(undefined);

    await expect(controller.acceptInvitation(id)).resolves.toBeUndefined();
    expect(driverInvitationsService.acceptInvitation).toHaveBeenCalledWith(id);
  });

  it('rejects an invitation by id', async () => {
    driverInvitationsService.rejectInvitation.mockResolvedValue(undefined);

    await expect(controller.rejectInvitation(id)).resolves.toBeUndefined();
    expect(driverInvitationsService.rejectInvitation).toHaveBeenCalledWith(id);
  });

  it('removes an invitation', async () => {
    driverInvitationsService.remove.mockResolvedValue(invitation);

    await expect(controller.remove(id)).resolves.toBe(invitation);
    expect(driverInvitationsService.remove).toHaveBeenCalledWith(id);
  });
});
