"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const map_service_1 = require("./map.service");
const map_controller_1 = require("./map.controller");
const map_repository_1 = require("./map.repository");
const location_batch_service_1 = require("./location-batch.service");
const users_module_1 = require("../users/users.module");
const user_schema_1 = require("../users/schemas/user.schema");
const chat_room_schema_1 = require("../chat/schemas/chat-room.schema");
const status_schema_1 = require("../status/schemas/status.schema");
const chat_module_1 = require("../chat/chat.module");
let MapModule = class MapModule {
};
exports.MapModule = MapModule;
exports.MapModule = MapModule = __decorate([
    (0, common_1.Module)({
        imports: [
            users_module_1.UsersModule,
            mongoose_1.MongooseModule.forFeature([
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: chat_room_schema_1.ChatRoom.name, schema: chat_room_schema_1.ChatRoomSchema },
                { name: status_schema_1.Status.name, schema: status_schema_1.StatusSchema },
            ]),
            (0, common_1.forwardRef)(() => chat_module_1.ChatModule),
        ],
        providers: [map_service_1.MapService, map_repository_1.MapRepository, location_batch_service_1.LocationBatchService],
        controllers: [map_controller_1.MapController],
        exports: [map_service_1.MapService, location_batch_service_1.LocationBatchService],
    })
], MapModule);
//# sourceMappingURL=map.module.js.map