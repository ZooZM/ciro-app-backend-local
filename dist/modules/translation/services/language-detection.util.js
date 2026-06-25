"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeakerLanguageCache = exports.SegmentLanguageLock = void 0;
const common_1 = require("@nestjs/common");
class SegmentLanguageLock {
    locked = null;
    onResult(detectedLanguage, isFinal) {
        if (!this.locked && detectedLanguage) {
            this.locked = detectedLanguage;
        }
        const lockedForThisResult = this.locked;
        if (isFinal) {
            this.locked = null;
        }
        return lockedForThisResult;
    }
    reset() {
        this.locked = null;
    }
    get current() {
        return this.locked;
    }
}
exports.SegmentLanguageLock = SegmentLanguageLock;
let SpeakerLanguageCache = class SpeakerLanguageCache {
    cache = new Map();
    key(roomId, speakerId) {
        return `${roomId}:${speakerId}`;
    }
    recordDetectedLanguage(roomId, speakerId, language) {
        this.cache.set(this.key(roomId, speakerId), language);
    }
    primaryLanguageForNextSegment(roomId, speakerId, defaultLanguage) {
        return this.cache.get(this.key(roomId, speakerId)) ?? defaultLanguage;
    }
    clear(roomId, speakerId) {
        this.cache.delete(this.key(roomId, speakerId));
    }
};
exports.SpeakerLanguageCache = SpeakerLanguageCache;
exports.SpeakerLanguageCache = SpeakerLanguageCache = __decorate([
    (0, common_1.Injectable)()
], SpeakerLanguageCache);
//# sourceMappingURL=language-detection.util.js.map