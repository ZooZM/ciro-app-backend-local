import { WalletDevModule } from './modules/wallet/dev/wallet-dev.module';
import { CardsDevModule } from './modules/cards/dev/cards-dev.module';
import { AllowanceDevModule } from './modules/allowance/dev/allowance-dev.module';

/**
 * 026 (research R18): the `/dev/*` simulator modules exist only outside
 * production. They are not registered at all when NODE_ENV=production, so
 * those routes answer 404 there.
 */
export function devModules(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv === 'production'
    ? []
    : [WalletDevModule, CardsDevModule, AllowanceDevModule];
}
