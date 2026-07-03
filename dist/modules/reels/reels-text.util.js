"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseHashtagsAndMentions = parseHashtagsAndMentions;
const HASHTAG_RE = /#([a-zA-Z0-9_]+)/g;
const MENTION_RE = /@([a-zA-Z0-9_.]+)/g;
async function parseHashtagsAndMentions(description, userModel) {
    const hashtags = [
        ...new Set([...description.matchAll(HASHTAG_RE)].map((m) => m[1].toLowerCase())),
    ];
    const candidateUsernames = [
        ...new Set([...description.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase())),
    ];
    if (candidateUsernames.length === 0) {
        return { hashtags, mentions: [] };
    }
    const resolved = await userModel
        .find({ username: { $in: candidateUsernames } })
        .select('_id username')
        .lean()
        .exec();
    const mentions = resolved.map((u) => ({
        userId: u._id.toString(),
        username: u.username,
    }));
    return { hashtags, mentions };
}
//# sourceMappingURL=reels-text.util.js.map