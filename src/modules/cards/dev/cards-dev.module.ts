import { Module } from '@nestjs/common';
import { FamilyCoreModule } from '../../family-core/family-core.module';
import { CardsModule } from '../cards.module';
import { CardsDevController } from './cards-dev.controller';

/** [DEV] Registered only when NODE_ENV !== 'production' (app.module.ts). */
@Module({
  imports: [CardsModule, FamilyCoreModule],
  controllers: [CardsDevController],
})
export class CardsDevModule {}
