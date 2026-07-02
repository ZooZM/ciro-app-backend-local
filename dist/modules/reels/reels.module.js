"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsModule = void 0;
const common_1 = require("@nestjs/common");
const reels_controller_1 = require("./reels.controller");
const reels_users_controller_1 = require("./reels-users.controller");
const reels_redirect_controller_1 = require("./reels-redirect.controller");
const reels_service_1 = require("./reels.service");
const reels_mock_store_1 = require("./mock/reels-mock.store");
const reels_repository_1 = require("./reels.repository");
let ReelsModule = class ReelsModule {
};
exports.ReelsModule = ReelsModule;
exports.ReelsModule = ReelsModule = __decorate([
    (0, common_1.Module)({
        controllers: [reels_controller_1.ReelsController, reels_users_controller_1.ReelsUsersController, reels_redirect_controller_1.ReelsRedirectController],
        providers: [
            reels_service_1.ReelsService,
            reels_mock_store_1.ReelsMockStore,
            { provide: reels_repository_1.REELS_REPOSITORY, useExisting: reels_mock_store_1.ReelsMockStore },
        ],
    })
], ReelsModule);
//# sourceMappingURL=reels.module.js.map