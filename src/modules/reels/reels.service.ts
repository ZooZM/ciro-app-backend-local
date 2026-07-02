import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { REELS_REPOSITORY } from './reels.repository';
import type { ReelsRepository } from './reels.repository';
import { FeedQueryDto, CommentsQueryDto } from './dto/feed-query.dto';

@Injectable()
export class ReelsService {
  constructor(
    @Inject(REELS_REPOSITORY) private readonly repository: ReelsRepository,
  ) {}

  getFeed(viewerId: string, query: FeedQueryDto) {
    return this.repository.listFeed({
      viewerId,
      cursor: query.cursor,
      limit: query.limit ?? 10,
      creatorId: query.creatorId,
    });
  }

  async getReel(id: string, viewerId: string) {
    const reel = await this.repository.getReel(id, viewerId);
    if (!reel) throw new NotFoundException('Reel not found');
    return reel;
  }

  async toggleLike(id: string, viewerId: string) {
    const result = await this.repository.toggleLike(id, viewerId);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async getComments(id: string, query: CommentsQueryDto) {
    const result = await this.repository.listComments(id, {
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async addComment(id: string, viewerId: string, text: string) {
    const result = await this.repository.addComment(id, viewerId, text);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async recordShare(id: string, viewerId: string) {
    const result = await this.repository.recordShare(id, viewerId);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async getProfile(userId: string, viewerId: string) {
    const profile = await this.repository.getProfile(userId, viewerId);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  async toggleFollow(userId: string, viewerId: string) {
    const result = await this.repository.toggleFollow(userId, viewerId);
    if (result === 'self') {
      throw new BadRequestException('Cannot follow yourself');
    }
    if (!result) throw new NotFoundException('User not found');
    return result;
  }
}
