import { Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { FamilyLinksRepository } from './repositories/family-links.repository';
import { FamilyLinkDocument } from './schemas/family-link.schema';
import { childNotFound, notALinkedChild } from './allowance-errors';

export type FamilyRole = 'none' | 'parent' | 'child';

/**
 * 026 (research R1): the single place where parent/child ownership is
 * checked. The acting user always comes from the JWT; a `childId` in a path
 * only addresses a resource. Failures are 404 (not 403) so callers cannot
 * probe which children exist.
 */
@Injectable()
export class FamilyAccessService {
  constructor(private readonly links: FamilyLinksRepository) {}

  async assertParentOf(
    actorId: string,
    childId: string,
    session?: ClientSession,
  ): Promise<FamilyLinkDocument> {
    if (!Types.ObjectId.isValid(actorId) || !Types.ObjectId.isValid(childId)) {
      throw childNotFound();
    }
    const link = await this.links.findActiveByParentAndChild(
      actorId,
      childId,
      session,
    );
    if (!link) throw childNotFound();
    return link;
  }

  async assertLinkedChild(
    actorId: string,
    session?: ClientSession,
  ): Promise<FamilyLinkDocument> {
    if (!Types.ObjectId.isValid(actorId)) throw notALinkedChild();
    const link = await this.links.findActiveByChild(actorId, session);
    if (!link) throw notALinkedChild();
    return link;
  }

  async getRole(userId: string, session?: ClientSession): Promise<FamilyRole> {
    if (!Types.ObjectId.isValid(userId)) return 'none';
    if (await this.links.findActiveByChild(userId, session)) return 'child';
    if ((await this.links.countActiveByParent(userId, session)) > 0)
      return 'parent';
    return 'none';
  }

  countActiveChildren(
    parentId: string,
    session?: ClientSession,
  ): Promise<number> {
    return this.links.countActiveByParent(parentId, session);
  }
}
