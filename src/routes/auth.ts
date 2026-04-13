import express, { Request, Response } from "express";
import { admin, db } from "../config/firebase";
import authMiddleware from "../middleware/auth";

const router = express.Router();

router.post("/verify-token", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { uid, phone_number } = req.user!;
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            const newUser = {
                uid,
                phone: phone_number || "",
                name: "",
                email: "",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            await userRef.set(newUser);
            return res.status(201).json({ user: newUser, created: true });
        }

        return res.json({ user: { uid, ...userDoc.data() }, created: false });
    } catch (err) {
        console.error("verify-token error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.put("/profile", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { uid } = req.user!;
        const { name, email } = req.body as { name?: unknown; email?: unknown };
        const update: Record<string, unknown> = {};

        if (name !== undefined) update.name = String(name).trim();
        if (email !== undefined) update.email = String(email).trim();

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        await db.collection("users").doc(uid).update(update);
        return res.json({ message: "Profile updated" });
    } catch (err) {
        console.error("profile update error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
