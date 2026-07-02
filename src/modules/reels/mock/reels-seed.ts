import { randomUUID } from 'crypto';
import {
  ReelCommentRecord,
  ReelCreatorRecord,
  ReelVideoRecord,
} from '../reels.repository';

/**
 * Seed data for the Reels mock store (specs/021-reels-video-feed).
 *
 * Video URLs point at test-videos.co.uk (BBC-affiliated test-video hosting)
 * and MDN's official cc0-videos bucket; images at picsum.photos' seeded
 * endpoint — all public sample URLs, per the "no backend-hosted video assets
 * in v1" clarification. Reused across multiple video records to reach ~40
 * seeded reels from a small pool of distinct source files.
 *
 * NOTE: Google's `commondatastorage.googleapis.com/gtv-videos-bucket` — the
 * historically ubiquitous "Big Buck Bunny" sample-video source used in nearly
 * every Flutter/media tutorial — now returns 403 Forbidden (verified via
 * curl during implementation; access appears to have been revoked/restricted
 * at the bucket level, unrelated to this project). Every URL below was
 * individually curl-verified (HTTP 206 + `content-type: video/mp4` on a
 * ranged request) before being added — don't reintroduce the old bucket.
 */

const SAMPLE_VIDEO_URLS = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_2MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_2MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_2MB.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

const CREATOR_NAMES = [
  'Lina K',
  'Omar R',
  'Sara M',
  'Yusuf A',
  'Nour E',
  'Karim S',
  'Dina H',
  'Tarek B',
];

const CREATOR_BIOS = [
  'Filmmaker. Cairo → Berlin.',
  'Home cook & content creator.',
  'Travel diaries, one reel at a time.',
  'Car enthusiast. Weekend racer.',
  'Music producer & DJ.',
  'Comedy sketches, no script.',
  'Fitness coach, 5am club.',
  'Street photography & short films.',
];

export interface ReelsSeedData {
  users: ReelCreatorRecord[];
  videos: ReelVideoRecord[];
  likes: { userId: string; videoId: string }[];
  comments: ReelCommentRecord[];
  shares: { userId: string; videoId: string; createdAt: string }[];
  follows: { followerId: string; followeeId: string }[];
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildReelsSeed(): ReelsSeedData {
  const users: ReelCreatorRecord[] = CREATOR_NAMES.map((name, i) => ({
    id: `mock-user-${i + 1}`,
    name,
    avatarUrl: `https://picsum.photos/seed/reels-avatar-${i + 1}/200/200`,
    bio: CREATOR_BIOS[i],
  }));

  const videoCount = 40;
  const videos: ReelVideoRecord[] = Array.from(
    { length: videoCount },
    (_, i) => {
      const creator = users[i % users.length];
      return {
        id: `reel-${i + 1}`,
        creatorId: creator.id,
        videoUrl: SAMPLE_VIDEO_URLS[i % SAMPLE_VIDEO_URLS.length],
        thumbnailUrl: `https://picsum.photos/seed/reels-thumb-${i + 1}/400/700`,
        // Newest first when sorted desc: reel-40 is most recent.
        createdAt: daysAgoIso(videoCount - i),
      };
    },
  );

  // A handful of seeded likes/comments/shares/follows so counts aren't all zero.
  const likes: { userId: string; videoId: string }[] = [];
  videos.forEach((video, i) => {
    const likerCount = (i % 5) + 1;
    for (let l = 0; l < likerCount; l++) {
      likes.push({
        userId: users[(i + l + 1) % users.length].id,
        videoId: video.id,
      });
    }
  });

  const comments: ReelCommentRecord[] = [];
  videos.forEach((video, i) => {
    if (i % 3 !== 0) return;
    comments.push({
      id: randomUUID(),
      videoId: video.id,
      authorId: users[(i + 2) % users.length].id,
      text: 'This is amazing 🔥',
      createdAt: daysAgoIso(videoCount - i - 1),
    });
  });

  const shares: { userId: string; videoId: string; createdAt: string }[] = [];
  videos.forEach((video, i) => {
    if (i % 4 !== 0) return;
    shares.push({
      userId: users[(i + 3) % users.length].id,
      videoId: video.id,
      createdAt: daysAgoIso(videoCount - i - 1),
    });
  });

  const follows: { followerId: string; followeeId: string }[] = [];
  users.forEach((user, i) => {
    const followee = users[(i + 1) % users.length];
    follows.push({ followerId: user.id, followeeId: followee.id });
  });

  return { users, videos, likes, comments, shares, follows };
}
