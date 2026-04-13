import express, { Request, Response } from "express";
import { db } from "../../config/firebase";
import adminAuthMiddleware from "../../middleware/adminAuth";

const router = express.Router();
const VALID_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

router.get("/", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        let query: FirebaseFirestore.Query = db.collection("orders").orderBy("createdAt", "desc");

        if (status && VALID_STATUSES.includes(String(status))) {
            query = db
                .collection("orders")
                .where("status", "==", String(status))
                .orderBy("createdAt", "desc");
        }

        const snapshot = await query.get();
        const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        return res.json({ orders });
    } catch (err) {
        console.error("admin GET /orders error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const orderId = String(req.params.id);
        const doc = await db.collection("orders").doc(orderId).get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });
        return res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
        console.error("admin GET /orders/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.put("/:id/status", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const { status } = req.body as { status?: string };
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
        }

        const orderId = String(req.params.id);
        const ref = db.collection("orders").doc(orderId);
        const doc = await ref.get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });

        await ref.update({ status });
        return res.json({ message: "Order status updated", status });
    } catch (err) {
        console.error("admin PUT /orders/:id/status error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
