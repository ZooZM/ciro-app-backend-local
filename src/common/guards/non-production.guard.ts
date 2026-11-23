import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * 026 (research R18): defence in depth for `/dev/*` routes. The dev modules
 * are not even registered when `NODE_ENV === 'production'`, but if one ever
 * were, this guard makes the route look like it does not exist.
 */
@Injectable()
export class NonProductionGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return true;
  }
}
