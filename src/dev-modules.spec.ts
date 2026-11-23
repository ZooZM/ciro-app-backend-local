import { devModules } from './dev-modules';
import { WalletDevModule } from './modules/wallet/dev/wallet-dev.module';
import { CardsDevModule } from './modules/cards/dev/cards-dev.module';
import { AllowanceDevModule } from './modules/allowance/dev/allowance-dev.module';

describe('dev simulator modules (026, R18)', () => {
  it('are not registered at all when NODE_ENV=production, so /dev/* answers 404 there', () => {
    expect(devModules('production')).toEqual([]);
  });

  it.each(['development', 'test', 'staging', undefined])(
    'are registered for NODE_ENV=%s',
    (env) => {
      expect(devModules(env)).toEqual([
        WalletDevModule,
        CardsDevModule,
        AllowanceDevModule,
      ]);
    },
  );
});
