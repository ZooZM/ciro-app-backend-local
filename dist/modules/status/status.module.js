"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const status_schema_1 = require("./schemas/status.schema");
const status_controller_1 = require("./status.controller");
const status_service_1 = require("./status.service");
const status_repository_1 = require("./status.repository");
const chat_module_1 = require("../chat/chat.module");
const users_module_1 = require("../users/users.module");
const notifications_module_1 = require("../notifications/notifications.module");
let StatusModule = class StatusModule {
};
exports.StatusModule = StatusModule;
exports.StatusModule = StatusModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([{ name: status_schema_1.Status.name, schema: status_schema_1.StatusSchema }]),
            (0, common_1.forwardRef)(() => chat_module_1.ChatModule),
            users_module_1.UsersModule,
            notifications_module_1.NotificationsModule,
        ],
        controllers: [status_controller_1.StatusController],
        providers: [status_service_1.StatusService, status_repository_1.StatusRepository],
        exports: [status_service_1.StatusService],
    })
], StatusModule);
//# sourceMappingURL=status.module.js.map