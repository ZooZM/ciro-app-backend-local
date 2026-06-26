import { ConfigService } from '@nestjs/config';
import { Room, type RoomOptions } from '@livekit/rtc-node';
export declare class LiveKitRtcProvider {
    private readonly configService;
    constructor(configService: ConfigService);
    get wsUrl(): string;
    get connectOptions(): RoomOptions;
    createRoom(): Room;
    createAgentToken(roomName: string, agentIdentity: string): Promise<string>;
}
