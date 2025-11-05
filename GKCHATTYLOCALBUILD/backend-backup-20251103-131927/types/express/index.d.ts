import { Types } from 'mongoose';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        _id: Types.ObjectId;
        username?: string;
        email?: string;
        role?: string;
        // Add other user properties if needed
      };
      reqId?: string;
    }
  }
}

// This empty export is needed to make this file a module
export {};
