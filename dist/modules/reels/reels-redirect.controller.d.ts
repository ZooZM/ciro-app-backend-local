import type { Response } from 'express';
export declare function renderRedirectPage(reelId: string, userAgent: string): {
    url: string | null;
    html: string;
};
export declare class ReelsRedirectController {
    redirect(id: string, res: Response): void;
}
