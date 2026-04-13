import express, { Request, Response } from "express";
import { admin, db } from "../config/firebase";
import authMiddleware from "../middleware/auth";

const router = express.Router({ mergeParams: true });

router.get("/", async (req: Request, res: Response) => {
    try {
        const productId = String(req.params.productId);
        const snapshot = await db
            .collection("reviews")
            .where("productId", "==", productId)
            .orderBy("createdAt", "desc")
            .get();

        const reviews = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.json({ reviews });
    } catch (err) {
        console.error("GET /reviews error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/", authMiddleware, async (req: Request, res: Response) => {
    try {
        const productId = String(req.params.productId);
        const { uid } = req.user!;
        const { rating, comment } = req.body as { rating?: unknown; comment?: unknown };

        const ratingNum = Number(rating);
        if (!rating || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ error: "rating must be between 1 and 5" });
        }

        const productDoc = await db.collection("products").doc(productId).get();
        if (!productDoc.exists) return res.status(404).json({ error: "Product not found" });

        const existing = await db
            .collection("reviews")
            .where("productId", "==", productId)
            .where("userId", "==", uid)
            .get();

        if (!existing.empty) {
            return res.status(409).json({ error: "You have already reviewed this product" });
        }

        const review = {
            productId,
            userId: uid,
            rating: ratingNum,
            comment: comment ? String(comment).trim() : "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const ref = await db.collection("reviews").add(review);
        return res.status(201).json({ id: ref.id, ...review });
    } catch (err) {
        console.error("POST /reviews error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
