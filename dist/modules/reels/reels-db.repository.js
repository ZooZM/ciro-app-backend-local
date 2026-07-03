"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsDbRepository = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../users/schemas/user.schema");
const reel_schema_1 = require("./schemas/reel.schema");
const reel_like_schema_1 = require("./schemas/reel-like.schema");
const reel_save_schema_1 = require("./schemas/reel-save.schema");
const reel_view_schema_1 = require("./schemas/reel-view.schema");
const reel_share_schema_1 = require("./schemas/reel-share.schema");
const reel_comment_schema_1 = require("./schemas/reel-comment.schema");
const follow_schema_1 = require("./schemas/follow.schema");
let ReelsDbRepository = class ReelsDbRepository {
    reelModel;
    likeModel;
    saveModel;
    viewModel;
    shareModel;
    commentModel;
    followModel;
    userModel;
    constructor(reelModel, likeModel, saveModel, viewModel, shareModel, commentModel, followModel, userModel) {
        this.reelModel = reelModel;
        this.likeModel = likeModel;
        this.saveModel = saveModel;
        this.viewModel = viewModel;
        this.shareModel = shareModel;
        this.commentModel = commentModel;
        this.followModel = followModel;
        this.userModel = userModel;
    }
    toObjectId(id) {
        if (!mongoose_2.Types.ObjectId.isValid(id))
            return null;
        return new mongoose_2.Types.ObjectId(id);
    }
    parseCursor(cursor) {
        if (cursor === undefined)
            return 0;
        const parsed = Number(cursor);
        if (!Number.isInteger(parsed) || parsed < 0) {
            throw new common_1.BadRequestException('Invalid cursor');
        }
        return parsed;
    }
    async hydrate(reels, viewerId) {
        if (reels.length === 0)
            return [];
        const viewerObjectId = this.toObjectId(viewerId);
        const creatorIds = [...new Set(reels.map((r) => r.creatorId.toString()))];
        const videoIds = reels.map((r) => r._id);
        const [creators, followed, liked, saved] = await Promise.all([
            this.userModel
                .find({ _id: { $in: creatorIds.map((id) => new mongoose_2.Types.ObjectId(id)) } })
                .select('_id name username avatarUrl')
                .lean()
                .exec(),
            viewerObjectId
                ? this.followModel
                    .find({
                    followerId: viewerObjectId,
                    followeeId: {
                        $in: creatorIds.map((id) => new mongoose_2.Types.ObjectId(id)),
                    },
                })
                    .lean()
                    .exec()
                : [],
            viewerObjectId
                ? this.likeModel
                    .find({ userId: viewerObjectId, videoId: { $in: videoIds } })
                    .lean()
                    .exec()
                : [],
            viewerObjectId
                ? this.saveModel
                    .find({ userId: viewerObjectId, videoId: { $in: videoIds } })
                    .lean()
                    .exec()
                : [],
        ]);
        const creatorById = new Map(creators.map((c) => [c._id.toString(), c]));
        const followedSet = new Set(followed.map((f) => f.followeeId.toString()));
        const likedSet = new Set(liked.map((l) => l.videoId.toString()));
        const savedSet = new Set(saved.map((s) => s.videoId.toString()));
        return reels.map((r) => {
            const creator = creatorById.get(r.creatorId.toString());
            return {
                id: r._id.toString(),
                videoUrl: r.videoUrl,
                thumbnailUrl: r.thumbnailUrl,
                createdAt: r.createdAt.toISOString(),
                description: r.description,
                hashtags: r.hashtags,
                mentions: r.mentions.map((m) => ({
                    userId: m.userId.toString(),
                    username: m.username,
                })),
                creator: {
                    id: r.creatorId.toString(),
                    name: creator?.name ?? 'Unknown',
                    username: creator?.username ?? '',
                    avatarUrl: creator?.avatarUrl ?? '',
                    viewerFollowing: followedSet.has(r.creatorId.toString()),
                },
                viewsCount: r.viewsCount,
                likesCount: r.likesCount,
                commentsCount: r.commentsCount,
                sharesCount: r.sharesCount,
                viewerLiked: likedSet.has(r._id.toString()),
                viewerSaved: savedSet.has(r._id.toString()),
            };
        });
    }
    toRecord(r) {
        return {
            id: r._id.toString(),
            creatorId: r.creatorId.toString(),
            videoUrl: r.videoUrl,
            thumbnailUrl: r.thumbnailUrl,
            description: r.description,
            hashtags: r.hashtags,
            mentions: r.mentions.map((m) => ({
                userId: m.userId.toString(),
                username: m.username,
            })),
            createdAt: r.createdAt.toISOString(),
        };
    }
    excludeFilter(excludeCreatorIds) {
        if (excludeCreatorIds.length === 0)
            return {};
        return {
            creatorId: {
                $nin: excludeCreatorIds
                    .map((id) => this.toObjectId(id))
                    .filter((id) => id !== null),
            },
        };
    }
    async listFeed(params) {
        const offset = this.parseCursor(params.cursor);
        const filter = {};
        if (params.creatorId) {
            if (params.excludeCreatorIds.includes(params.creatorId)) {
                return { items: [], nextCursor: null };
            }
            const creatorObjectId = this.toObjectId(params.creatorId);
            if (!creatorObjectId)
                return { items: [], nextCursor: null };
            filter.creatorId = creatorObjectId;
        }
        else {
            Object.assign(filter, this.excludeFilter(params.excludeCreatorIds));
        }
        if (params.hashtag) {
            filter.hashtags = params.hashtag.toLowerCase();
        }
        const isScoped = Boolean(params.creatorId || params.hashtag);
        const total = await this.reelModel.countDocuments(filter).exec();
        if (total === 0)
            return { items: [], nextCursor: null };
        if (isScoped) {
            const docs = await this.reelModel
                .find(filter)
                .sort({ createdAt: -1, _id: -1 })
                .skip(offset)
                .limit(params.limit)
                .exec();
            const nextOffset = offset + params.limit;
            return {
                items: await this.hydrate(docs, params.viewerId),
                nextCursor: nextOffset < total ? String(nextOffset) : null,
            };
        }
        const docs = [];
        const sorted = await this.reelModel
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .exec();
        for (let i = 0; i < params.limit; i++) {
            docs.push(sorted[(offset + i) % sorted.length]);
        }
        return {
            items: await this.hydrate(docs, params.viewerId),
            nextCursor: String(offset + params.limit),
        };
    }
    async getReel(id, viewerId, excludeCreatorIds) {
        const objectId = this.toObjectId(id);
        if (!objectId)
            return null;
        const doc = await this.reelModel
            .findOne({ _id: objectId, ...this.excludeFilter(excludeCreatorIds) })
            .exec();
        if (!doc)
            return null;
        const [hydrated] = await this.hydrate([doc], viewerId);
        return hydrated;
    }
    async toggleLike(id, viewerId) {
        const videoId = this.toObjectId(id);
        const userId = this.toObjectId(viewerId);
        if (!videoId || !userId)
            return null;
        const reel = await this.reelModel.findById(videoId).exec();
        if (!reel)
            return null;
        const existing = await this.likeModel
            .findOneAndDelete({ userId, videoId })
            .exec();
        let liked;
        if (existing) {
            liked = false;
            reel.likesCount = Math.max(0, reel.likesCount - 1);
            await this.userModel
                .updateOne({ _id: reel.creatorId }, { $inc: { totalLikes: -1 } })
                .exec();
        }
        else {
            try {
                await this.likeModel.create({ userId, videoId });
                liked = true;
                reel.likesCount += 1;
                await this.userModel
                    .updateOne({ _id: reel.creatorId }, { $inc: { totalLikes: 1 } })
                    .exec();
            }
            catch {
                liked = true;
            }
        }
        await reel.save();
        return {
            liked,
            likesCount: reel.likesCount,
            reel: this.toRecord(reel),
        };
    }
    async listComments(id, params) {
        const videoId = this.toObjectId(id);
        if (!videoId)
            return null;
        const reel = await this.reelModel.findById(videoId).exec();
        if (!reel)
            return null;
        const offset = this.parseCursor(params.cursor);
        const filter = { videoId };
        if (params.excludeAuthorIds.length > 0) {
            filter.authorId = {
                $nin: params.excludeAuthorIds
                    .map((aid) => this.toObjectId(aid))
                    .filter((aid) => aid !== null),
            };
        }
        const total = await this.commentModel.countDocuments(filter).exec();
        const docs = await this.commentModel
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(offset)
            .limit(params.limit)
            .exec();
        const authorIds = [...new Set(docs.map((d) => d.authorId.toString()))];
        const authors = await this.userModel
            .find({ _id: { $in: authorIds.map((aid) => new mongoose_2.Types.ObjectId(aid)) } })
            .select('_id name avatarUrl')
            .lean()
            .exec();
        const authorById = new Map(authors.map((a) => [a._id.toString(), a]));
        const nextOffset = offset + params.limit;
        return {
            items: docs.map((c) => {
                const author = authorById.get(c.authorId.toString());
                return {
                    id: c._id.toString(),
                    authorId: c.authorId.toString(),
                    authorName: author?.name ?? 'Unknown',
                    authorAvatarUrl: author?.avatarUrl ?? '',
                    text: c.text,
                    createdAt: c.createdAt.toISOString(),
                };
            }),
            nextCursor: nextOffset < total ? String(nextOffset) : null,
            commentsCount: reel.commentsCount,
        };
    }
    async addComment(id, viewerId, text) {
        const videoId = this.toObjectId(id);
        const authorId = this.toObjectId(viewerId);
        if (!videoId || !authorId)
            return null;
        const reel = await this.reelModel.findById(videoId).exec();
        if (!reel)
            return null;
        const created = await this.commentModel.create({ videoId, authorId, text });
        reel.commentsCount += 1;
        await reel.save();
        const author = await this.userModel
            .findById(authorId)
            .select('name avatarUrl')
            .lean()
            .exec();
        return {
            comment: {
                id: created._id.toString(),
                authorId: viewerId,
                authorName: author?.name ?? 'Unknown',
                authorAvatarUrl: author?.avatarUrl ?? '',
                text: created.text,
                createdAt: created.createdAt.toISOString(),
            },
            commentsCount: reel.commentsCount,
        };
    }
    async recordShare(id, viewerId) {
        const videoId = this.toObjectId(id);
        const userId = this.toObjectId(viewerId);
        if (!videoId || !userId)
            return null;
        const reel = await this.reelModel.findById(videoId).exec();
        if (!reel)
            return null;
        await this.shareModel.create({ userId, videoId });
        reel.sharesCount += 1;
        await reel.save();
        return { sharesCount: reel.sharesCount };
    }
    async getProfile(userId, viewerId, excludeCreatorIds) {
        const targetId = this.toObjectId(userId);
        if (!targetId)
            return null;
        if (excludeCreatorIds.includes(userId))
            return null;
        const user = await this.userModel.findById(targetId).exec();
        if (!user)
            return null;
        const viewerObjectId = this.toObjectId(viewerId);
        const videos = await this.reelModel
            .find({ creatorId: targetId })
            .sort({ createdAt: -1, _id: -1 })
            .select('_id thumbnailUrl')
            .lean()
            .exec();
        const isFollowing = viewerObjectId
            ? Boolean(await this.followModel
                .exists({ followerId: viewerObjectId, followeeId: targetId })
                .exec())
            : false;
        return {
            user: {
                id: user._id.toString(),
                name: user.name,
                username: user.username ?? '',
                avatarUrl: user.avatarUrl ?? '',
                bio: user.bio ?? '',
            },
            stats: {
                followers: user.followersCount,
                following: user.followingCount,
                totalLikes: user.totalLikes,
            },
            videos: videos.map((v) => ({
                id: v._id.toString(),
                thumbnailUrl: v.thumbnailUrl,
            })),
            viewer: {
                following: isFollowing,
                isSelf: userId === viewerId,
            },
        };
    }
    async toggleFollow(userId, viewerId) {
        if (userId === viewerId)
            return 'self';
        const followeeId = this.toObjectId(userId);
        const followerId = this.toObjectId(viewerId);
        if (!followeeId || !followerId)
            return null;
        const followee = await this.userModel.findById(followeeId).exec();
        if (!followee)
            return null;
        const existing = await this.followModel
            .findOneAndDelete({ followerId, followeeId })
            .exec();
        let following;
        if (existing) {
            following = false;
            await this.userModel
                .updateOne({ _id: followeeId }, { $inc: { followersCount: -1 } })
                .exec();
            await this.userModel
                .updateOne({ _id: followerId }, { $inc: { followingCount: -1 } })
                .exec();
            followee.followersCount = Math.max(0, followee.followersCount - 1);
        }
        else {
            try {
                await this.followModel.create({ followerId, followeeId });
                following = true;
                await this.userModel
                    .updateOne({ _id: followeeId }, { $inc: { followersCount: 1 } })
                    .exec();
                await this.userModel
                    .updateOne({ _id: followerId }, { $inc: { followingCount: 1 } })
                    .exec();
                followee.followersCount += 1;
            }
            catch {
                following = true;
            }
        }
        return { following, followersCount: followee.followersCount };
    }
    async recordView(id, viewerId) {
        const videoId = this.toObjectId(id);
        const userId = this.toObjectId(viewerId);
        if (!videoId || !userId)
            return null;
        const reel = await this.reelModel.findById(videoId).exec();
        if (!reel)
            return null;
        try {
            await this.viewModel.create({ userId, videoId });
            reel.viewsCount += 1;
            await reel.save();
        }
        catch {
        }
        return { viewsCount: reel.viewsCount };
    }
    async toggleSave(id, viewerId) {
        const videoId = this.toObjectId(id);
        const userId = this.toObjectId(viewerId);
        if (!videoId || !userId)
            return null;
        const reel = await this.reelModel.findById(videoId).exec();
        if (!reel)
            return null;
        const existing = await this.saveModel
            .findOneAndDelete({ userId, videoId })
            .exec();
        if (existing)
            return { saved: false };
        try {
            await this.saveModel.create({ userId, videoId });
            return { saved: true };
        }
        catch {
            return { saved: true };
        }
    }
    async listLiked(viewerId, params) {
        return this.listByRelation(this.likeModel, viewerId, params);
    }
    async listSaved(viewerId, params) {
        return this.listByRelation(this.saveModel, viewerId, params);
    }
    async listByRelation(relationModel, viewerId, params) {
        const userId = this.toObjectId(viewerId);
        if (!userId)
            return { items: [], nextCursor: null };
        const offset = this.parseCursor(params.cursor);
        const total = await relationModel.countDocuments({ userId }).exec();
        if (total === 0)
            return { items: [], nextCursor: null };
        const relations = await relationModel
            .find({ userId })
            .sort({ createdAt: -1, _id: -1 })
            .skip(offset)
            .limit(params.limit)
            .lean()
            .exec();
        const videoIds = relations.map((r) => r.videoId);
        const reels = await this.reelModel
            .find({
            _id: { $in: videoIds },
            ...this.excludeFilter(params.excludeCreatorIds),
        })
            .exec();
        const reelById = new Map(reels.map((r) => [r._id.toString(), r]));
        const ordered = videoIds
            .map((id) => reelById.get(id.toString()))
            .filter((r) => r !== undefined);
        const nextOffset = offset + params.limit;
        return {
            items: await this.hydrate(ordered, viewerId),
            nextCursor: nextOffset < total ? String(nextOffset) : null,
        };
    }
    async searchReels(params) {
        const offset = this.parseCursor(params.cursor);
        const escaped = params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = {
            hashtags: { $regex: escaped, $options: 'i' },
            ...this.excludeFilter(params.excludeCreatorIds),
        };
        const total = await this.reelModel.countDocuments(filter).exec();
        if (total === 0)
            return { items: [], nextCursor: null };
        const docs = await this.reelModel
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(offset)
            .limit(params.limit)
            .exec();
        const nextOffset = offset + params.limit;
        return {
            items: await this.hydrate(docs, params.viewerId),
            nextCursor: nextOffset < total ? String(nextOffset) : null,
        };
    }
    async searchUsers(params) {
        const offset = this.parseCursor(params.cursor);
        const escaped = params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const excludeIds = [params.viewerId, ...params.excludeUserIds]
            .map((id) => this.toObjectId(id))
            .filter((id) => id !== null);
        const filter = {
            _id: { $nin: excludeIds },
            $or: [
                { username: { $regex: escaped, $options: 'i' } },
                { name: { $regex: escaped, $options: 'i' } },
            ],
        };
        const total = await this.userModel.countDocuments(filter).exec();
        if (total === 0)
            return { items: [], nextCursor: null };
        const docs = await this.userModel
            .find(filter)
            .sort({ name: 1, _id: 1 })
            .skip(offset)
            .limit(params.limit)
            .lean()
            .exec();
        const viewerObjectId = this.toObjectId(params.viewerId);
        const followed = viewerObjectId
            ? await this.followModel
                .find({
                followerId: viewerObjectId,
                followeeId: { $in: docs.map((d) => d._id) },
            })
                .lean()
                .exec()
            : [];
        const followedSet = new Set(followed.map((f) => f.followeeId.toString()));
        const nextOffset = offset + params.limit;
        return {
            items: docs.map((u) => ({
                id: u._id.toString(),
                username: u.username ?? '',
                name: u.name,
                avatarUrl: u.avatarUrl ?? '',
                viewerFollowing: followedSet.has(u._id.toString()),
            })),
            nextCursor: nextOffset < total ? String(nextOffset) : null,
        };
    }
};
exports.ReelsDbRepository = ReelsDbRepository;
exports.ReelsDbRepository = ReelsDbRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(reel_schema_1.Reel.name)),
    __param(1, (0, mongoose_1.InjectModel)(reel_like_schema_1.ReelLike.name)),
    __param(2, (0, mongoose_1.InjectModel)(reel_save_schema_1.ReelSave.name)),
    __param(3, (0, mongoose_1.InjectModel)(reel_view_schema_1.ReelView.name)),
    __param(4, (0, mongoose_1.InjectModel)(reel_share_schema_1.ReelShare.name)),
    __param(5, (0, mongoose_1.InjectModel)(reel_comment_schema_1.ReelComment.name)),
    __param(6, (0, mongoose_1.InjectModel)(follow_schema_1.Follow.name)),
    __param(7, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], ReelsDbRepository);
//# sourceMappingURL=reels-db.repository.js.map