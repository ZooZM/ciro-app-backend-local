import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FamilyLinkStatus = 'active' | 'unlinked';
export type UnlinkReason = 'parent' | 'child_account_deleted';

/** 026 data-model §1.3. `active → unlinked` is terminal; relinking makes a new document. */
@Schema({ collection: 'family_links', timestamps: true })
export class FamilyLink {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parentUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['active', 'unlinked'],
    default: 'active',
  })
  status: FamilyLinkStatus;

  @Prop({ type: Date, required: true })
  childConfirmedAt: Date;

  @Prop({ type: Date, required: true })
  parentConfirmedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'LedgerAccount', required: true })
  childAccountId: Types.ObjectId;

  @Prop({ type: Date })
  unlinkedAt?: Date;

  @Prop({ type: String, enum: ['parent', 'child_account_deleted'] })
  unlinkReason?: UnlinkReason;

  /** Bumped in every transaction that changes the child's summary; clients keep the highest. */
  @Prop({ type: Number, required: true, default: 1 })
  rev: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export type FamilyLinkDocument = HydratedDocument<FamilyLink>;
export const FamilyLinkSchema = SchemaFactory.createForClass(FamilyLink);

/** FR-004: at most one active parent per child. */
FamilyLinkSchema.index(
  { childUserId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
FamilyLinkSchema.index({ parentUserId: 1, status: 1 });
