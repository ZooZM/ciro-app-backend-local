import { NotFoundException } from '@nestjs/common';
import { NonProductionGuard } from './non-production.guard';

describe('NonProductionGuard (026, R18)', () => {
  const original = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  it('throws 404 in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new NonProductionGuard().canActivate()).toThrow(
      NotFoundException,
    );
  });

  it.each(['development', 'test', 'staging', undefined])(
    'allows NODE_ENV=%s',
    (env) => {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
      expect(new NonProductionGuard().canActivate()).toBe(true);
    },
  );
});
