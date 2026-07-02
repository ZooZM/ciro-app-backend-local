import { StatusContentType, StatusPrivacy } from '../schemas/status.schema';
export declare class CreateStatusDto {
    clientStatusId: string;
    contentType: StatusContentType;
    textContent?: string;
    backgroundColor?: string;
    fontStyle?: string;
    musicTrackId?: string;
    caption?: string;
    privacy: StatusPrivacy;
    longitude?: number;
    latitude?: number;
    audience?: string[];
}
