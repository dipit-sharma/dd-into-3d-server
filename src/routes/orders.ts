import crypto from "crypto";
import express, { Request, Response } from "express";
import Razorpay from "razorpay";
import { admin, db } from "../config/firebase";
import authMiddleware from "../middleware/auth";

const router = express.Router();

type OrderItem = {
    productId: string;
    name: string;
    price: number;
    qty: number;
};

function getRazorpay() {
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
}

router.post("/create-razorpay-order", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { items, shippingAddress } = req.body as {
            items?: OrderItem[];
            shippingAddress?: unknown;
        };

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "items must be a non-empty array" });
        }

        if (!shippingAddress) {
            return res.status(400).json({ error: "shippingAddress is required" });
        }

        const totalAmount = items.reduce((sum, item) => sum + item.price * item.qty, 0);
        const razorpay = getRazorpay();

        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(totalAmount * 100),
            currency: "INR",
            receipt: `rcpt_${Date.now()}`,
        });

        return res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
        });
    } catch (err) {
        console.error("create-razorpay-order error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/verify-payment", authMiddleware, async (req: Request, res: Response) => {
    try {
        const {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            items,
            shippingAddress,
        } = req.body as {
            razorpayOrderId?: string;
            razorpayPaymentId?: string;
            razorpaySignature?: string;
            items?: OrderItem[];
            shippingAddress?: unknown;
        };

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({
                error: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required",
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "items must be a non-empty array" });
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (expectedSignature !== razorpaySignature) {
            return res.status(400).json({ error: "Payment verification failed: signature mismatch" });
        }

        const totalAmount = items.reduce((sum, item) => sum + item.price * item.qty, 0);

        const order = {
            userId: req.user!.uid,
            type: "product",
            items,
            totalAmount,
            status: "confirmed",
            razorpayOrderId,
            razorpayPaymentId,
            shippingAddress,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const ref = await db.collection("orders").add(order);
        return res.status(201).json({ id: ref.id, ...order });
    } catch (err) {
        console.error("verify-payment error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/", authMiddleware, async (req: Request, res: Response) => {
    try {
        const snapshot = await db
            .collection("orders")
            .where("userId", "==", req.user!.uid)
            .orderBy("createdAt", "desc")
            .get();

        const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

        return res.json(order);
    } catch (err) {
        console.error("GET /orders/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
