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
var LocationBatchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationBatchService = void 0;
const common_1 = require("@nestjs/common");
let LocationBatchService = class LocationBatchService {
    static { LocationBatchService_1 = this; }
    static FLUSH_INTERVAL_MS = 5000;
    buckets = new Map();
    flushHandler;
    timer;
    constructor() {
        this.timer = setInterval(() => this.flush(), LocationBatchService_1.FLUSH_INTERVAL_MS);
    }
    onFlush(handler) {
        this.flushHandler = handler;
    }
    enqueue(roomId, userId, item) {
        if (!this.buckets.has(roomId))
            this.buckets.set(roomId, new Map());
        this.buckets.get(roomId).set(userId, item);
    }
    cancel(userId) {
        for (const bucket of this.buckets.values()) {
            bucket.delete(userId);
        }
    }
    flush() {
        if (!this.flushHandler || this.buckets.size === 0)
            return;
        for (const [roomId, bucket] of this.buckets) {
            if (bucket.size === 0)
                continue;
            this.flushHandler(roomId, Array.from(bucket.values()));
            bucket.clear();
        }
    }
    onModuleDestroy() {
        clearInterval(this.timer);
    }
};
exports.LocationBatchService = LocationBatchService;
exports.LocationBatchService = LocationBatchService = LocationBatchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], LocationBatchService);
//# sourceMappingURL=location-batch.service.js.map