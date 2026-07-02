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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsMockStore = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const reels_seed_1 = require("./reels-seed");
let ReelsMockStore = class ReelsMockStore {
    users;
    videos;
    likes;
    comments;
    shares;
    follows;
    feedOrder;
    constructor() {
        const seed = (0, reels_seed_1.buildReelsSeed)();
        this.users = seed.users;
        this.videos = seed.videos;
        this.likes = seed.likes;
        this.comments = seed.comments;
        this.shares = seed.shares;
        this.follows = seed.follows;
        this.feedOrder = [...this.videos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    findUser(id) {
        return this.users.find((u) => u.id === id);
    }
    findVideo(id) {
        return this.videos.find((v) => v.id === id);
    }
    likesCount(videoId) {
        return this.likes.filter((l) => l.videoId === videoId).length;
    }
    commentsCount(videoId) {
        return this.comments.filter((c) => c.videoId === videoId).length;
    }
    sharesCount(videoId) {
        return this.shares.filter((s) => s.videoId === videoId).length;
    }
    followersCount(userId) {
        return this.follows.filter((f) => f.followeeId === userId).length;
    }
    followingCount(userId) {
        return this.follows.filter((f) => f.followerId === userId).length;
    }
    isFollowing(followerId, followeeId) {
        return this.follows.some((f) => f.followerId === followerId && f.followeeId === followeeId);
    }
    hasLiked(userId, videoId) {
        return this.likes.some((l) => l.userId === userId && l.videoId === videoId);
    }
    toReelDto(video, viewerId) {
        const creator = this.findUser(video.creatorId);
        return {
            id: video.id,
            videoUrl: video.videoUrl,
            thumbnailUrl: video.thumbnailUrl,
            createdAt: video.createdAt,
            creator: {
                id: creator?.id ?? video.creatorId,
                name: creator?.name ?? 'Unknown',
                avatarUrl: creator?.avatarUrl ?? '',
                viewerFollowing: creator ? this.isFollowing(viewerId, creator.id) : false,
            },
            likesCount: this.likesCount(video.id),
            commentsCount: this.commentsCount(video.id),
            sharesCount: this.sharesCount(video.id),
            viewerLiked: this.hasLiked(viewerId, video.id),
        };
    }
    toCommentDto(comment) {
        const author = this.findUser(comment.authorId);
        return {
            id: comment.id,
            authorId: comment.authorId,
            authorName: author?.name ?? 'Unknown',
            authorAvatarUrl: author?.avatarUrl ?? '',
            text: comment.text,
            createdAt: comment.createdAt,
        };
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
    async listFeed(params) {
        const offset = this.parseCursor(params.cursor);
        if (params.creatorId) {
            const filtered = this.feedOrder.filter((v) => v.creatorId === params.creatorId);
            const page = filtered.slice(offset, offset + params.limit);
            const nextOffset = offset + params.limit;
            return {
                items: page.map((v) => this.toReelDto(v, params.viewerId)),
                nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
            };
        }
        if (this.feedOrder.length === 0) {
            return { items: [], nextCursor: null };
        }
        const items = [];
        for (let i = 0; i < params.limit; i++) {
            const video = this.feedOrder[(offset + i) % this.feedOrder.length];
            items.push(this.toReelDto(video, params.viewerId));
        }
        return { items, nextCursor: String(offset + params.limit) };
    }
    async getReel(id, viewerId) {
        const video = this.findVideo(id);
        return video ? this.toReelDto(video, viewerId) : null;
    }
    async toggleLike(id, viewerId) {
        const video = this.findVideo(id);
        if (!video)
            return null;
        const idx = this.likes.findIndex((l) => l.userId === viewerId && l.videoId === id);
        if (idx >= 0) {
            this.likes.splice(idx, 1);
        }
        else {
            this.likes.push({ userId: viewerId, videoId: id });
        }
        return { liked: idx < 0, likesCount: this.likesCount(id) };
    }
    async listComments(id, params) {
        const video = this.findVideo(id);
        if (!video)
            return null;
        const offset = this.parseCursor(params.cursor);
        const ordered = this.comments
            .filter((c) => c.videoId === id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const page = ordered.slice(offset, offset + params.limit);
        const nextOffset = offset + params.limit;
        return {
            items: page.map((c) => this.toCommentDto(c)),
            nextCursor: nextOffset < ordered.length ? String(nextOffset) : null,
            commentsCount: ordered.length,
        };
    }
    async addComment(id, viewerId, text) {
        const video = this.findVideo(id);
        if (!video)
            return null;
        const record = {
            id: (0, crypto_1.randomUUID)(),
            videoId: id,
            authorId: viewerId,
            text,
            createdAt: new Date().toISOString(),
        };
        this.comments.push(record);
        return { comment: this.toCommentDto(record), commentsCount: this.commentsCount(id) };
    }
    async recordShare(id, viewerId) {
        const video = this.findVideo(id);
        if (!video)
            return null;
        this.shares.push({ userId: viewerId, videoId: id, createdAt: new Date().toISOString() });
        return { sharesCount: this.sharesCount(id) };
    }
    async getProfile(userId, viewerId) {
        const user = this.findUser(userId);
        if (!user)
            return null;
        const creatorVideos = this.feedOrder.filter((v) => v.creatorId === userId);
        const totalLikes = creatorVideos.reduce((sum, v) => sum + this.likesCount(v.id), 0);
        return {
            user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, bio: user.bio },
            stats: {
                followers: this.followersCount(userId),
                following: this.followingCount(userId),
                totalLikes,
            },
            videos: creatorVideos.map((v) => ({ id: v.id, thumbnailUrl: v.thumbnailUrl })),
            viewer: {
                following: this.isFollowing(viewerId, userId),
                isSelf: userId === viewerId,
            },
        };
    }
    async toggleFollow(userId, viewerId) {
        if (userId === viewerId)
            return 'self';
        const user = this.findUser(userId);
        if (!user)
            return null;
        const idx = this.follows.findIndex((f) => f.followerId === viewerId && f.followeeId === userId);
        if (idx >= 0) {
            this.follows.splice(idx, 1);
        }
        else {
            this.follows.push({ followerId: viewerId, followeeId: userId });
        }
        return { following: idx < 0, followersCount: this.followersCount(userId) };
    }
};
exports.ReelsMockStore = ReelsMockStore;
exports.ReelsMockStore = ReelsMockStore = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ReelsMockStore);
//# sourceMappingURL=reels-mock.store.js.map