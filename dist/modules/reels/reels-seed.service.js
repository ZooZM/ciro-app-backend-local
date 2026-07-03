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
var ReelsSeedService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsSeedService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../users/schemas/user.schema");
const reel_schema_1 = require("./schemas/reel.schema");
const reel_like_schema_1 = require("./schemas/reel-like.schema");
const reel_share_schema_1 = require("./schemas/reel-share.schema");
const reel_comment_schema_1 = require("./schemas/reel-comment.schema");
const follow_schema_1 = require("./schemas/follow.schema");
const reels_text_util_1 = require("./reels-text.util");
const SAMPLE_VIDEO_URLS = [
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_2MB.mp4',
    'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
    'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_2MB.mp4',
    'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
    'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_2MB.mp4',
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];
const CREATORS = [
    { name: 'Lina K', username: 'lina.k', bio: 'Filmmaker. Cairo → Berlin.' },
    { name: 'Omar R', username: 'omar', bio: 'Home cook & content creator.' },
    {
        name: 'Sara M',
        username: 'sara.m',
        bio: 'Travel diaries, one reel at a time.',
    },
    {
        name: 'Yusuf A',
        username: 'yusuf.a',
        bio: 'Car enthusiast. Weekend racer.',
    },
    { name: 'Nour E', username: 'nour.e', bio: 'Music producer & DJ.' },
    { name: 'Karim S', username: 'karim.s', bio: 'Comedy sketches, no script.' },
    { name: 'Dina H', username: 'dina.h', bio: 'Fitness coach, 5am club.' },
    {
        name: 'Tarek B',
        username: 'tarek.b',
        bio: 'Street photography & short films.',
    },
];
const HASHTAG_POOL = [
    'travel',
    'cairo',
    'foodie',
    'cars',
    'music',
    'comedy',
    'fitness',
    'photography',
];
function daysAgo(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
let ReelsSeedService = ReelsSeedService_1 = class ReelsSeedService {
    userModel;
    reelModel;
    likeModel;
    shareModel;
    commentModel;
    followModel;
    logger = new common_1.Logger(ReelsSeedService_1.name);
    constructor(userModel, reelModel, likeModel, shareModel, commentModel, followModel) {
        this.userModel = userModel;
        this.reelModel = reelModel;
        this.likeModel = likeModel;
        this.shareModel = shareModel;
        this.commentModel = commentModel;
        this.followModel = followModel;
    }
    async onModuleInit() {
        await this.backfillUsernames();
        await this.backfillStatus();
        const existingReels = await this.reelModel.countDocuments().exec();
        if (existingReels > 0) {
            this.logger.log('Reels already seeded — skipping demo content seed');
            return;
        }
        await this.seed();
    }
    async backfillStatus() {
        const result = await this.reelModel
            .updateMany({ status: { $exists: false } }, { $set: { status: reel_schema_1.ReelStatus.PUBLISHED, publishedAt: new Date() } })
            .exec();
        if (result.modifiedCount > 0) {
            this.logger.log(`Backfilled status=published for ${result.modifiedCount} pre-v3 reel(s)`);
        }
    }
    async backfillUsernames() {
        const usernameless = await this.userModel
            .find({ username: { $exists: false } })
            .select('_id name')
            .exec();
        for (const user of usernameless) {
            const base = user.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '.')
                .replace(/^\.+|\.+$/g, '') || 'user';
            let candidate = base;
            let suffix = 1;
            while (await this.userModel.exists({ username: candidate })) {
                candidate = `${base}${suffix++}`;
            }
            user.username = candidate;
            await user.save();
        }
        if (usernameless.length > 0) {
            this.logger.log(`Backfilled username for ${usernameless.length} existing user(s)`);
        }
    }
    async seed() {
        this.logger.log('Seeding Reels demo content into MongoDB...');
        const creators = await Promise.all(CREATORS.map(async (c, i) => {
            const existing = await this.userModel
                .findOne({ username: c.username })
                .exec();
            if (existing)
                return existing;
            return this.userModel.create({
                name: c.name,
                username: c.username,
                phoneNumber: `+100000000${i}`,
                bio: c.bio,
                avatarUrl: `https://picsum.photos/seed/reels-avatar-${i + 1}/200/200`,
                isPhoneVerified: true,
            });
        }));
        const videoCount = 40;
        const reelDocs = [];
        for (let i = 0; i < videoCount; i++) {
            const creator = creators[i % creators.length];
            const mentionTarget = creators[(i + 1) % creators.length];
            const tag1 = HASHTAG_POOL[i % HASHTAG_POOL.length];
            const tag2 = HASHTAG_POOL[(i + 3) % HASHTAG_POOL.length];
            const description = `Reel #${i + 1} moments #${tag1} #${tag2} feat. @${mentionTarget.username}`;
            const { hashtags, mentions } = await (0, reels_text_util_1.parseHashtagsAndMentions)(description, this.userModel);
            const seededAt = daysAgo(videoCount - i);
            const reel = await this.reelModel.create({
                creatorId: creator._id,
                videoUrl: SAMPLE_VIDEO_URLS[i % SAMPLE_VIDEO_URLS.length],
                thumbnailUrl: `https://picsum.photos/seed/reels-thumb-${i + 1}/400/700`,
                description,
                hashtags,
                mentions: mentions.map((m) => ({
                    userId: new mongoose_2.Types.ObjectId(m.userId),
                    username: m.username,
                })),
                status: reel_schema_1.ReelStatus.PUBLISHED,
                publishedAt: seededAt,
                createdAt: seededAt,
            });
            reelDocs.push(reel);
        }
        for (let i = 0; i < reelDocs.length; i++) {
            const reel = reelDocs[i];
            const likerCount = (i % 5) + 1;
            for (let l = 0; l < likerCount; l++) {
                const liker = creators[(i + l + 1) % creators.length];
                await this.likeModel.create({ userId: liker._id, videoId: reel._id });
                await this.userModel
                    .updateOne({ _id: reel.creatorId }, { $inc: { totalLikes: 1 } })
                    .exec();
            }
            reel.likesCount = likerCount;
            if (i % 3 === 0) {
                const author = creators[(i + 2) % creators.length];
                await this.commentModel.create({
                    videoId: reel._id,
                    authorId: author._id,
                    text: 'This is amazing 🔥',
                    createdAt: daysAgo(videoCount - i - 1),
                });
                reel.commentsCount = 1;
            }
            if (i % 4 === 0) {
                const sharer = creators[(i + 3) % creators.length];
                await this.shareModel.create({
                    userId: sharer._id,
                    videoId: reel._id,
                    createdAt: daysAgo(videoCount - i - 1),
                });
                reel.sharesCount = 1;
            }
            reel.viewsCount = (i % 7) * 37;
            await reel.save();
        }
        for (let i = 0; i < creators.length; i++) {
            const follower = creators[i];
            const followee = creators[(i + 1) % creators.length];
            await this.followModel.create({
                followerId: follower._id,
                followeeId: followee._id,
            });
            await this.userModel
                .updateOne({ _id: followee._id }, { $inc: { followersCount: 1 } })
                .exec();
            await this.userModel
                .updateOne({ _id: follower._id }, { $inc: { followingCount: 1 } })
                .exec();
        }
        this.logger.log(`Seeded ${creators.length} creators and ${reelDocs.length} reels`);
    }
};
exports.ReelsSeedService = ReelsSeedService;
exports.ReelsSeedService = ReelsSeedService = ReelsSeedService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(reel_schema_1.Reel.name)),
    __param(2, (0, mongoose_1.InjectModel)(reel_like_schema_1.ReelLike.name)),
    __param(3, (0, mongoose_1.InjectModel)(reel_share_schema_1.ReelShare.name)),
    __param(4, (0, mongoose_1.InjectModel)(reel_comment_schema_1.ReelComment.name)),
    __param(5, (0, mongoose_1.InjectModel)(follow_schema_1.Follow.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], ReelsSeedService);
//# sourceMappingURL=reels-seed.service.js.map