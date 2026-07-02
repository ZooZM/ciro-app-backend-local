import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { StatusRepository } from './status.repository';
import { UsersRepository } from '../users/users.repository';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { coarsen } from '../map/map.service';
import { PushService } from '../notifications/push.service';
import { MessageType } from '../chat/schemas/message.schema';
import { SendMessageDto } from '../chat/dto/send-message.dto';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReactStatusDto } from './dto/react-status.dto';
import { ReplyStatusDto } from './dto/reply-status.dto';
import {
  StatusContentType,
  StatusDocument,
  StatusPrivacy,
} from './schemas/status.schema';

@Injectable()
export class StatusService {
  constructor(
    private readonly statusRepository: StatusRepository,
    private readonly usersRepository: UsersRepository,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly pushService: PushService,
  ) {}

  async createStatus(
    userId: string,
    dto: CreateStatusDto,
    file?: Express.Multer.File,
  ): Promise<{ status: Record<string, unknown>; isNew: boolean }> {
    const existing = await this.statusRepository.findByClientStatusId(
      dto.clientStatusId,
    );
    if (existing) {
      await existing.populate('authorId', 'name avatarUrl');
      return { status: this.toStatusJson(existing, userId), isNew: false };
    }

    if (dto.contentType === StatusContentType.TEXT) {
      if (!dto.textContent) {
        throw new BadRequestException(
          'textContent is required for text statuses',
        );
      }
    } else if (!file) {
      throw new BadRequestException(
        'A media file is required for this content type',
      );
    }

    let audience: Types.ObjectId[] = [];
    if (dto.privacy === StatusPrivacy.PRIVATE) {
      if (!dto.audience?.length) {
        throw new BadRequestException(
          'audience is required for private statuses',
        );
      }
      const mutualContactIds =
        await this.usersRepository.findMutualContactIds(userId);
      if (
        !this.statusRepository.isAudienceSubsetOfMutualContacts(
          dto.audience,
          mutualContactIds,
        )
      ) {
        throw new BadRequestException(
          'audience must be a subset of mutual contacts',
        );
      }
      audience = dto.audience.map((id) => new Types.ObjectId(id));
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const _id = new Types.ObjectId();
    const mediaUrl = file
      ? `/status/media/${_id.toString()}/${file.filename}`
      : undefined;

    const created = await this.statusRepository.create({
      _id,
      authorId: new Types.ObjectId(userId),
      clientStatusId: dto.clientStatusId,
      contentType: dto.contentType,
      textContent: dto.textContent,
      mediaUrl,
      mimeType: file?.mimetype,
      backgroundColor: dto.backgroundColor,
      fontStyle: dto.fontStyle,
      musicTrackId: dto.musicTrackId,
      caption: dto.caption,
      privacy: dto.privacy,
      audience,
      expiresAt,
    });

    if (dto.privacy === StatusPrivacy.PRIVATE) {
      await this.usersRepository.updateOne({ _id: userId } as any, {
        $set: { defaultStatusAudience: audience },
      });
    }

    await created.populate('authorId', 'name avatarUrl');
    await this.fanOutStatusReceived(created);

    if (dto.privacy === StatusPrivacy.SHOW_ON_MAP) {
      // Pin location = device's GPS at post time, not whatever stale
      // `location` the user last shared — also flips isSharingLocation so
      // the pin surfaces on the Following tab (authorized contacts), not
      // just Explore. Without this, broadcastExploreStatusAdded silently
      // no-ops for authors who never previously shared a location.
      if (dto.longitude !== undefined && dto.latitude !== undefined) {
        await this.usersRepository.updateOne({ _id: userId } as any, {
          $set: {
            location: {
              type: 'Point',
              coordinates: [dto.longitude, dto.latitude],
            },
            locationUpdatedAt: new Date(),
            isSharingLocation: true,
          },
        });
      }
      await this.broadcastExploreStatusAdded(userId);
    }

    return { status: this.toStatusJson(created, userId), isNew: true };
  }

  /**
   * 018-snap-map-realtime: a new "Show on Map" status should appear live on
   * viewers' Explore tab, the same way live location works for Following —
   * without this, the pin only shows up after the viewer leaves and reopens
   * Explore (the next full REST refresh). Broadcast server-wide (Explore has
   * no contact-gating, unlike Following's room-based fan-out) with coarse
   * coordinates always, since a single broadcast can't apply per-viewer
   * coarsening like the REST endpoint does — the client backfills via its
   * own next Explore reload if it turns out the viewer is a contact.
   */
  private async broadcastExploreStatusAdded(authorId: string): Promise<void> {
    const author = await this.usersRepository.findById(authorId);
    if (!author?.location?.coordinates) return;
    const [lng, lat] = author.location.coordinates;

    this.chatGateway.server.emit('exploreStatusAdded', {
      _id: authorId,
      name: author.name,
      phoneNumber: author.phoneNumber,
      avatarUrl: (author as any).avatarUrl,
      isOnline: author.isOnline === true,
      location: {
        type: 'Point',
        coordinates: [coarsen(lng), coarsen(lat)],
      },
      locationUpdatedAt: (author.locationUpdatedAt ?? new Date()).toISOString(),
      sharedGroupIds: [],
      isCoarse: true,
      hasActiveStatus: true,
    });
  }

  async getFeed(userId: string): Promise<Record<string, unknown>[]> {
    const statuses = await this.statusRepository.findFeedForUser(userId);
    return statuses.map((status) => this.toStatusJson(status, userId));
  }

  async getViewers(
    statusId: string,
    userId: string,
  ): Promise<Record<string, unknown>[]> {
    const status = await this.statusRepository.findActiveById(statusId);
    if (!status) throw new NotFoundException('Status not found');
    if (status.authorId.toString() !== userId) throw new ForbiddenException();

    const populated =
      await this.statusRepository.findViewersByStatusId(statusId);
    return (populated?.views ?? []).map((view: any) => {
      const viewer = view.userId;
      return {
        userId: viewer?._id ? viewer._id.toString() : viewer.toString(),
        name: viewer?.name ?? '',
        avatarUrl: viewer?.avatarUrl ?? '',
        viewedAt: view.viewedAt,
      };
    });
  }

  async getReactions(
    statusId: string,
    userId: string,
  ): Promise<Record<string, unknown>[]> {
    const status = await this.statusRepository.findActiveById(statusId);
    if (!status) throw new NotFoundException('Status not found');
    if (status.authorId.toString() !== userId) throw new ForbiddenException();

    const populated =
      await this.statusRepository.findReactionsByStatusId(statusId);
    return (populated?.reactions ?? []).map((r: any) => {
      const reactor = r.userId;
      return {
        userId: reactor?._id ? reactor._id.toString() : reactor.toString(),
        reaction: r.reaction,
        createdAt: r.createdAt,
      };
    });
  }

  async recordView(statusId: string, viewerId: string): Promise<void> {
    const status = await this.statusRepository.findActiveById(statusId);
    if (!status) return;
    if (status.authorId.toString() === viewerId) return;

    const viewedAt = new Date();
    const updated = await this.statusRepository.upsertView(
      statusId,
      viewerId,
      viewedAt,
    );
    if (!updated) return; // already viewed - first viewedAt wins

    const viewer = await this.usersRepository.findById(viewerId);
    this.chatGateway.server
      .to(`user:${status.authorId.toString()}`)
      .emit('statusViewerAdded', {
        statusId,
        viewer: {
          userId: viewerId,
          name: (viewer as any)?.name ?? '',
          avatarUrl: (viewer as any)?.avatarUrl ?? '',
        },
        viewedAt,
      });
  }

  async react(
    statusId: string,
    userId: string,
    dto: ReactStatusDto,
  ): Promise<{ statusId: string; reaction: string }> {
    const status = await this.checkVisibilityOrThrow(statusId, userId);
    const createdAt = new Date();
    await this.statusRepository.upsertReaction(
      statusId,
      userId,
      dto.reaction,
      createdAt,
    );

    if (status.authorId.toString() !== userId) {
      const reactor = await this.usersRepository.findById(userId);
      const reactorName = (reactor as any)?.name ?? '';
      this.chatGateway.server
        .to(`user:${status.authorId.toString()}`)
        .emit('statusReacted', {
          statusId,
          reaction: dto.reaction,
          from: {
            userId,
            name: reactorName,
            avatarUrl: (reactor as any)?.avatarUrl ?? '',
          },
          createdAt,
        });

      await this.pushService.notifyStatusReaction(status.authorId.toString(), {
        reactorName,
        statusId,
      });
    }

    return { statusId, reaction: dto.reaction };
  }

  async reply(statusId: string, userId: string, dto: ReplyStatusDto) {
    const status = await this.checkVisibilityOrThrow(statusId, userId);
    const authorId = status.authorId.toString();

    const { roomId } = await this.chatService.resolvePrivateRoom(
      userId,
      authorId,
    );

    const { message } = await this.chatService.saveMessage(
      userId,
      {
        chatRoomId: roomId,
        content: dto.message,
        clientMessageId: randomUUID(),
        type: MessageType.TEXT,
      } as SendMessageDto,
      {
        statusRef: {
          statusId: status._id,
          statusAuthorId: status.authorId,
          expiresAt: status.expiresAt,
        },
      },
    );

    this.chatGateway.server
      .to(roomId)
      .to(`user:${authorId}`)
      .emit('newMessage', message);

    return message;
  }

  async getDefaultAudience(userId: string): Promise<Record<string, unknown>[]> {
    const user = await this.usersRepository.findById(userId);
    if (!user?.defaultStatusAudience?.length) return [];

    const mutualContactIds =
      await this.usersRepository.findMutualContactIds(userId);
    const mutualSet = new Set(mutualContactIds.map((id) => id.toString()));
    const validIds = user.defaultStatusAudience
      .map((id) => id.toString())
      .filter((id) => mutualSet.has(id));
    if (!validIds.length) return [];

    const audienceUsers = await this.usersRepository.find({
      _id: { $in: validIds },
    } as any);
    return audienceUsers.map((u: any) => ({
      userId: u._id.toString(),
      name: u.name,
      phoneNumber: u.phoneNumber,
      avatarUrl: u.avatarUrl ?? '',
    }));
  }

  /** Used by `GET /status/media/:statusId/:filename` (FR-007); 404 (not 403) on denial. */
  async getStatusForMediaAccess(
    statusId: string,
    userId: string,
  ): Promise<StatusDocument> {
    const status = await this.statusRepository.findActiveById(statusId);
    if (!status) throw new NotFoundException();
    if (!(await this.isPermittedToView(status, userId))) {
      throw new NotFoundException();
    }
    return status;
  }

  private async checkVisibilityOrThrow(
    statusId: string,
    userId: string,
  ): Promise<StatusDocument> {
    const status = await this.statusRepository.findActiveById(statusId);
    if (!status) throw new NotFoundException('Status not found');
    if (!(await this.isPermittedToView(status, userId))) {
      throw new ForbiddenException('Not permitted to view this status');
    }
    return status;
  }

  private async isPermittedToView(
    status: StatusDocument,
    userId: string,
  ): Promise<boolean> {
    if (status.authorId.toString() === userId) return true;

    if (status.privacy === StatusPrivacy.PRIVATE) {
      return (status.audience ?? []).some((id) => id.toString() === userId);
    }

    const mutualContactIds = await this.usersRepository.findMutualContactIds(
      status.authorId.toString(),
    );
    return mutualContactIds.some((id) => id.toString() === userId);
  }

  private async fanOutStatusReceived(status: StatusDocument): Promise<void> {
    let recipientIds: string[];
    if (status.privacy === StatusPrivacy.PRIVATE) {
      recipientIds = (status.audience ?? []).map((id) => id.toString());
    } else {
      // status.authorId may already be populated (a User document) at this
      // point, in which case .toString() would yield its inspect() output
      // rather than the hex id — extract the underlying _id in that case.
      const author = status.authorId as any;
      const authorId = author?._id ? author._id.toString() : author.toString();
      const mutualContactIds =
        await this.usersRepository.findMutualContactIds(authorId);
      recipientIds = mutualContactIds.map((id) => id.toString());
    }

    for (const recipientId of recipientIds) {
      this.chatGateway.server
        .to(`user:${recipientId}`)
        .emit('statusReceived', this.toStatusJson(status, recipientId));
    }
  }

  private toStatusJson(
    status: StatusDocument,
    viewerId: string,
  ): Record<string, unknown> {
    const author = status.authorId as any;
    const authorIdStr = author?._id ? author._id.toString() : author.toString();

    const isViewed = (status.views ?? []).some((view: any) => {
      const vid = view.userId?._id
        ? view.userId._id.toString()
        : view.userId.toString();
      return vid === viewerId;
    });

    return {
      id: status._id.toString(),
      authorId: authorIdStr,
      authorName: author?.name ?? '',
      authorAvatar: author?.avatarUrl ?? '',
      clientStatusId: status.clientStatusId,
      contentType: status.contentType,
      textContent: status.textContent ?? null,
      mediaUrl: status.mediaUrl ?? null,
      caption: status.caption ?? null,
      backgroundColor: status.backgroundColor ?? null,
      fontStyle: status.fontStyle ?? null,
      musicTrackId: status.musicTrackId ?? null,
      privacy: status.privacy,
      createdAt: (status as any).createdAt,
      expiresAt: status.expiresAt,
      isViewed,
      isMine: authorIdStr === viewerId,
    };
  }
}
