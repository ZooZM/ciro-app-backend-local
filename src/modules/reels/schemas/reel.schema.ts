import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReelDocument = Reel & Document;

@Schema({ _id: false })
export class ReelMention {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  username: string;
}

export const ReelMentionSchema = SchemaFactory.createForClass(ReelMention);

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Reel {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  creatorId: Types.ObjectId;

  @Prop({ required: true })
  videoUrl: string;

  @Prop({ required: true })
  thumbnailUrl: string;

  // FR-047: supports #hashtags and @mentions; parsed at write time.
  @Prop({ default: '', maxlength: 2200 })
  description: string;

  // Normalized (lowercase, no '#'), deduped. Multikey-indexed for hashtag
  // feeds (exact match) and search (substring regex — see reels.service.ts).
  @Prop({ type: [String], default: [] })
  hashtags: string[];

  // Only @mentions that resolve to an existing user (FR-047).
  @Prop({ type: [ReelMentionSchema], default: [] })
  mentions: ReelMention[];

  // Stored counters (FR-055) — updated via $inc alongside the relation
  // write that causes the change; never computed by aggregation on read.
  @Prop({ default: 0 })
  viewsCount: number;

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ default: 0 })
  commentsCount: number;

  @Prop({ default: 0 })
  sharesCount: number;

  createdAt?: Date;
}

export const ReelSchema = SchemaFactory.createForClass(Reel);

// Feed cursor: newest first, `_id` as a stable tiebreak for same-millisecond seeds.
ReelSchema.index({ createdAt: -1, _id: -1 });
// Creator-scoped feed / profile grid.
ReelSchema.index({ creatorId: 1, createdAt: -1 });
// Hashtag feed exact-match + order (FR-047a); also backs substring search (R11).
ReelSchema.index({ hashtags: 1, createdAt: -1 });
