import type { NextFunction, Request, Response } from "express";
import { admin } from "../config/firebase";

export default async function adminAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized: Missing token" });
    }

    const token = authHeader.split("Bearer ")[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        if (!decodedToken.admin) {
            return res.status(403).json({ error: "Forbidden: Admin access required" });
        }
        req.user = decodedToken;
        return next();
    } catch {
        return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
}
