import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { ChatRoomsRepository } from './chat-rooms.repository';
import { MessagesRepository } from './messages.repository';
import { UsersRepository } from '../users/users.repository';
import { Types } from 'mongoose';
import { NotFoundException } from '@nestjs/common';

describe('ChatService', () => {
  let service: ChatService;
  let chatRoomsRepository: {
    findPrivateRoom: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    updateLastMessage: jest.Mock;
    getUserRooms: jest.Mock;
  };
  let messagesRepository: {
    findByClientMessageId: jest.Mock;
    create: jest.Mock;
  };

  const mockRoom = {
    _id: new Types.ObjectId(),
    type: 'PRIVATE',
    participants: [new Types.ObjectId(), new Types.ObjectId()],
    save: jest.fn().mockResolvedValue({}),
  };

  const mockMessage = {
    _id: new Types.ObjectId(),
    chatRoomId: mockRoom._id,
    senderId: mockRoom.participants[0],
    content: 'Hello',
    save: jest.fn().mockResolvedValue({}),
    populate: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    chatRoomsRepository = {
      findPrivateRoom: jest.fn(),
      create: jest.fn().mockResolvedValue(mockRoom),
      findById: jest.fn(),
      updateLastMessage: jest.fn(),
      getUserRooms: jest.fn(),
    };
    messagesRepository = {
      findByClientMessageId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(mockMessage),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ChatRoomsRepository, useValue: chatRoomsRepository },
        { provide: MessagesRepository, useValue: messagesRepository },
        { provide: UsersRepository, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPrivateRoom', () => {
    it('should return an existing room if it exists', async () => {
      chatRoomsRepository.findPrivateRoom.mockResolvedValue(mockRoom);
      const result = await service.createPrivateRoom(
        mockRoom.participants[0].toHexString(),
        mockRoom.participants[1].toHexString(),
      );
      expect(result).toEqual(mockRoom);
      expect(chatRoomsRepository.findPrivateRoom).toHaveBeenCalled();
    });

    it('should create a new room if it does not exist', async () => {
      chatRoomsRepository.findPrivateRoom.mockResolvedValue(null);
      const result = await service.createPrivateRoom(
        mockRoom.participants[0].toHexString(),
        mockRoom.participants[1].toHexString(),
      );
      expect(result).toBeDefined();
      expect(chatRoomsRepository.create).toHaveBeenCalled();
    });
  });

  describe('saveMessage', () => {
    it('should throw NotFoundException if room does not exist', async () => {
      chatRoomsRepository.findById.mockResolvedValue(null);
      await expect(
        service.saveMessage(mockRoom.participants[0].toHexString(), {
          chatRoomId: mockRoom._id.toHexString(),
          content: 'Hi',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should save a message and update room lastMessage', async () => {
      chatRoomsRepository.findById.mockResolvedValue(mockRoom);
      const result = await service.saveMessage(
        mockRoom.participants[0].toHexString(),
        {
          chatRoomId: mockRoom._id.toHexString(),
          content: 'Hi',
        },
      );
      expect(result).toBeDefined();
      expect(messagesRepository.create).toHaveBeenCalled();
      expect(chatRoomsRepository.updateLastMessage).toHaveBeenCalledWith(
        mockRoom._id.toHexString(),
        mockMessage._id.toString(),
      );
    });
  });

  describe('getUserRooms', () => {
    it('should query rooms for the given user', async () => {
      chatRoomsRepository.getUserRooms.mockResolvedValue([mockRoom]);

      const result = await service.getUserRooms(
        mockRoom.participants[0].toHexString(),
      );
      expect(result).toEqual([mockRoom]);
      expect(chatRoomsRepository.getUserRooms).toHaveBeenCalledWith(
        mockRoom.participants[0].toHexString(),
        20,
        undefined,
      );
    });
  });
});
