import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FamilyAccessService } from './family-access.service';
import type { FamilyLinksRepository } from './repositories/family-links.repository';

describe('FamilyAccessService (026, R1)', () => {
  const parent = new Types.ObjectId().toString();
  const child = new Types.ObjectId().toString();
  const stranger = new Types.ObjectId().toString();
  const formerParent = new Types.ObjectId().toString();

  /** One active link parent→child; formerParent→child exists only as `unlinked`. */
  const links = {
    findActiveByParentAndChild: jest.fn((p: string, c: string) =>
      Promise.resolve(
        p === parent && c === child
          ? { _id: 'link', parentUserId: p, childUserId: c }
          : null,
      ),
    ),
    findActiveByChild: jest.fn((c: string) =>
      Promise.resolve(
        c === child
          ? { _id: 'link', parentUserId: parent, childUserId: c }
          : null,
      ),
    ),
    countActiveByParent: jest.fn((p: string) =>
      Promise.resolve(p === parent ? 1 : 0),
    ),
  } as unknown as FamilyLinksRepository;

  const service = new FamilyAccessService(links);

  const expectCode = async (p: Promise<unknown>, code: string) => {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).getResponse()).toMatchObject({
      error: code,
    });
  };

  it('lets the active parent through', async () => {
    await expect(service.assertParentOf(parent, child)).resolves.toMatchObject({
      _id: 'link',
    });
  });

  it('gives a stranger 404 CHILD_NOT_FOUND', async () => {
    await expectCode(
      service.assertParentOf(stranger, child),
      'CHILD_NOT_FOUND',
    );
  });

  it('gives the child acting as a parent 404 CHILD_NOT_FOUND', async () => {
    await expectCode(service.assertParentOf(child, child), 'CHILD_NOT_FOUND');
  });

  it('gives a former parent after unlink 404 CHILD_NOT_FOUND', async () => {
    await expectCode(
      service.assertParentOf(formerParent, child),
      'CHILD_NOT_FOUND',
    );
  });

  it('gives malformed ids 404 instead of a cast error', async () => {
    await expectCode(service.assertParentOf('nope', child), 'CHILD_NOT_FOUND');
    await expectCode(service.assertLinkedChild('nope'), 'NOT_A_LINKED_CHILD');
  });

  it('assertLinkedChild accepts only an actively linked child', async () => {
    await expect(service.assertLinkedChild(child)).resolves.toBeTruthy();
    await expectCode(service.assertLinkedChild(parent), 'NOT_A_LINKED_CHILD');
    await expectCode(service.assertLinkedChild(stranger), 'NOT_A_LINKED_CHILD');
  });

  it('getRole returns child, parent or none', async () => {
    await expect(service.getRole(child)).resolves.toBe('child');
    await expect(service.getRole(parent)).resolves.toBe('parent');
    await expect(service.getRole(stranger)).resolves.toBe('none');
  });
});
