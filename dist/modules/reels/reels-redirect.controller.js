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
exports.ReelsRedirectController = void 0;
exports.renderRedirectPage = renderRedirectPage;
const common_1 = require("@nestjs/common");
const IOS_STORE_URL = process.env.REELS_IOS_STORE_URL || 'https://apps.apple.com/app/cirochat';
const ANDROID_STORE_URL = process.env.REELS_ANDROID_STORE_URL ||
    'https://play.google.com/store/apps/details?id=com.cirochat.app';
function renderRedirectPage(reelId, userAgent) {
    const ua = userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const target = isIOS ? IOS_STORE_URL : isAndroid ? ANDROID_STORE_URL : null;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Watch this reel on CiroChat</title>
  ${target ? `<meta http-equiv="refresh" content="0; url=${target}" />` : ''}
</head>
<body>
  <p>Watch reel ${reelId} in the CiroChat app.</p>
  <p><a href="${IOS_STORE_URL}">Download on the App Store</a></p>
  <p><a href="${ANDROID_STORE_URL}">Get it on Google Play</a></p>
</body>
</html>`;
    return { url: target, html };
}
let ReelsRedirectController = class ReelsRedirectController {
    redirect(id, res) {
        const userAgent = res.req.headers['user-agent']?.toString() ?? '';
        const { html } = renderRedirectPage(id, userAgent);
        res.type('html').send(html);
    }
};
exports.ReelsRedirectController = ReelsRedirectController;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReelsRedirectController.prototype, "redirect", null);
exports.ReelsRedirectController = ReelsRedirectController = __decorate([
    (0, common_1.Controller)('reels')
], ReelsRedirectController);
//# sourceMappingURL=reels-redirect.controller.js.map