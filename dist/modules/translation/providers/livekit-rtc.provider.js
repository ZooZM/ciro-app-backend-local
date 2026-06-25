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
exports.LiveKitRtcProvider = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const livekit_server_sdk_1 = require("livekit-server-sdk");
const rtc_node_1 = require("@livekit/rtc-node");
let LiveKitRtcProvider = class LiveKitRtcProvider {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    get wsUrl() {
        return this.configService.get('LIVEKIT_WS_URL');
    }
    get connectOptions() {
        return { autoSubscribe: false, dynacast: false };
    }
    createRoom() {
        return new rtc_node_1.Room();
    }
    async createAgentToken(roomName, agentIdentity) {
        const apiKey = this.configService.get('LIVEKIT_API_KEY');
        const apiSecret = this.configService.get('LIVEKIT_API_SECRET');
        const token = new livekit_server_sdk_1.AccessToken(apiKey, apiSecret, {
            identity: agentIdentity,
            name: agentIdentity,
        });
        token.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: false,
            canPublishData: true,
            canSubscribe: true,
            hidden: true,
        });
        return token.toJwt();
    }
};
exports.LiveKitRtcProvider = LiveKitRtcProvider;
exports.LiveKitRtcProvider = LiveKitRtcProvider = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LiveKitRtcProvider);
//# sourceMappingURL=livekit-rtc.provider.js.map