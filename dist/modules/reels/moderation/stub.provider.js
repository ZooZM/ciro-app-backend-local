"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubModerationProvider = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
const FLAG_MARKER = /nsfw-test/i;
let StubModerationProvider = class StubModerationProvider {
    analyze(videoPath, description) {
        if (FLAG_MARKER.test((0, path_1.basename)(videoPath))) {
            return Promise.resolve({
                verdict: 'flagged',
                flaggedSource: 'video',
                categories: ['nsfw-test-marker'],
                providerRef: 'stub',
            });
        }
        if (FLAG_MARKER.test(description)) {
            return Promise.resolve({
                verdict: 'flagged',
                flaggedSource: 'description',
                categories: ['nsfw-test-marker'],
                providerRef: 'stub',
            });
        }
        return Promise.resolve({ verdict: 'clean', providerRef: 'stub' });
    }
};
exports.StubModerationProvider = StubModerationProvider;
exports.StubModerationProvider = StubModerationProvider = __decorate([
    (0, common_1.Injectable)()
], StubModerationProvider);
//# sourceMappingURL=stub.provider.js.map