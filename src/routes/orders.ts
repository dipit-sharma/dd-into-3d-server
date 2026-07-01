import express, { Request, Response } from "express";
import { db } from "../config/firebase";
import authMiddleware from "../middleware/auth";
import { OrderRecord } from "../types/orders";

const router = express.Router();

function normalizeOrderRecord(id: string, data: FirebaseFirestore.DocumentData) {
    const paymentProvider =
        typeof data.paymentProvider === "string"
            ? data.paymentProvider
            : data.razorpayOrderId || data.razorpayPaymentId
              ? "razorpay"
              : undefined;

    const paymentStatus =
        typeof data.paymentStatus === "string"
            ? data.paymentStatus
            : data.razorpayPaymentId
              ? "paid"
              : data.status === "pending"
                ? "pending"
                : undefined;

    return {
        id,
        ...data,
        paymentProvider,
        paymentStatus,
        merchantOrderId:
            typeof data.merchantOrderId === "string" ? data.merchantOrderId : data.razorpayOrderId,
        gatewayTransactionId:
            typeof data.gatewayTransactionId === "string"
                ? data.gatewayTransactionId
                : data.razorpayPaymentId,
    };
}

router.get("/", authMiddleware, async (req: Request, res: Response) => {
    try {
        const snapshot = await db
            .collection("orders")
            .where("userId", "==", req.user!.uid)
            .orderBy("createdAt", "desc")
            .get();

        const orders = snapshot.docs.map((doc) => normalizeOrderRecord(doc.id, doc.data()));
        return res.json({ orders });
    } catch (err) {
        console.error("GET /orders error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
        const orderId = String(req.params.id);
        const doc = await db.collection("orders").doc(orderId).get();
        if (!doc.exists) return res.status(404).json({ error: "Order not found" });

        const order = { id: doc.id, ...doc.data() } as Record<string, unknown>;
        if (order.userId !== req.user!.uid) {
            return res.status(403).json({ error: "Forbidden" });
        }

        return res.json(normalizeOrderRecord(doc.id, doc.data() ?? {}));
    } catch (err) {
        console.error("GET /orders/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
