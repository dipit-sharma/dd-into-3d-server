import "express";
import type { auth } from "firebase-admin";

declare global {
    namespace Express {
        interface Request {
            user?: auth.DecodedIdToken;
        }
    }
}

export { };
