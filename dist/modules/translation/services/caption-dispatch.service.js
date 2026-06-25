"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CaptionDispatchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaptionDispatchService = exports.CAPTION_DATA_TOPIC = void 0;
const common_1 = require("@nestjs/common");
exports.CAPTION_DATA_TOPIC = 'translation';
let CaptionDispatchService = CaptionDispatchService_1 = class CaptionDispatchService {
    logger = new common_1.Logger(CaptionDispatchService_1.name);
    async dispatch(input) {
        if (input.listenerIdentities.length === 0)
            return;
        const localParticipant = input.room.localParticipant;
        if (!localParticipant) {
            this.logger.warn(`Cannot dispatch caption for speaker ${input.speakerId}: agent has no local participant`);
            return;
        }
        const payload = {
            v: 1,
            type: input.type,
            speakerId: input.speakerId,
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage,
            text: input.text,
            segmentId: input.segmentId,
            seq: input.seq,
            ts: Date.now(),
        };
        const data = new TextEncoder().encode(JSON.stringify(payload));
        this.logger.debug(`[publishData] speaker=${input.speakerId} type=${input.type} topic=${exports.CAPTION_DATA_TOPIC} destinations=${JSON.stringify(input.listenerIdentities)} bytes=${data.length}`);
        try {
            await localParticipant.publishData(data, {
                reliable: input.type === 'final',
                destination_identities: input.listenerIdentities,
                topic: exports.CAPTION_DATA_TOPIC,
            });
            this.logger.debug(`[publishData] OK — speaker=${input.speakerId} type=${input.type}`);
        }
        catch (error) {
            this.logger.error(`Failed to publish caption for speaker ${input.speakerId}: ${error.message}`);
            throw error;
        }
    }
};
exports.CaptionDispatchService = CaptionDispatchService;
exports.CaptionDispatchService = CaptionDispatchService = CaptionDispatchService_1 = __decorate([
    (0, common_1.Injectable)()
], CaptionDispatchService);
//# sourceMappingURL=caption-dispatch.service.js.map