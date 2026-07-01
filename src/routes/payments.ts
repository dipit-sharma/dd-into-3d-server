import express, { Request, Response } from "express";
import { admin, db } from "../config/firebase";
import authMiddleware from "../middleware/auth";
import { getPhonePeOrderStatus, initiatePhonePePayment } from "../services/payments/phonepe";
import { OrderItem, OrderRecord, PaymentStatus, ShippingAddress } from "../types/orders";

const router = express.Router();

type CheckoutItemInput = {
    productId?: string;
    qty?: number;
};

function isShippingAddress(value: unknown): value is ShippingAddress {
    if (!value || typeof value !== "object") {
        return false;
    }

    const address = value as Record<string, unknown>;

    return ["name", "phone", "addressLine1", "city", "state", "pincode"].every(
        (field) => typeof address[field] === "string" && String(address[field]).trim().length > 0,
    );
}

async function buildCanonicalItems(items: CheckoutItemInput[]) {
    const productIds = items.map((item) => item.productId).filter((id): id is string => typeof id === "string");

    if (productIds.length !== items.length || productIds.length === 0) {
        throw new Error("Each item must include a productId");
    }

    const refs = productIds.map((productId) => db.collection("products").doc(productId));
    const snapshots = await db.getAll(...refs);
    const canonicalItems: OrderItem[] = [];

    for (let index = 0; index < snapshots.length; index += 1) {
        const snapshot = snapshots[index];
        const requestedItem = items[index];

        if (!snapshot.exists) {
            throw new Error(`Product not found: ${requestedItem.productId}`);
        }

        const data = snapshot.data() as { name?: unknown; price?: unknown; stock?: unknown };
        const qty = Number(requestedItem.qty);

        if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error("Each item quantity must be a positive integer");
        }

        const stock = typeof data.stock === "number" ? data.stock : 0;
        if (stock < qty) {
            throw new Error(`Insufficient stock for product ${snapshot.id}`);
        }

        canonicalItems.push({
            productId: snapshot.id,
            name: typeof data.name === "string" ? data.name : "Product",
            price: Number(data.price),
            qty,
        });
    }

    return canonicalItems;
}

function mapGatewayStateToPaymentStatus(gatewayState: string): PaymentStatus {
    if (gatewayState === "COMPLETED") {
        return "paid";
    }

    if (gatewayState === "FAILED") {
        return "failed";
    }

    return "pending";
}

async function findOrderByMerchantOrderId(merchantOrderId: string) {
    const snapshot = await db
        .collection("orders")
        .where("merchantOrderId", "==", merchantOrderId)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    return snapshot.docs[0];
}

async function reconcilePhonePeOrder(merchantOrderId: string) {
    const orderDoc = await findOrderByMerchantOrderId(merchantOrderId);

    if (!orderDoc) {
        return null;
    }

    const orderData = orderDoc.data() as OrderRecord;
    const phonePeStatus = await getPhonePeOrderStatus(merchantOrderId);
    const latestPayment = phonePeStatus.paymentDetails?.[0];
    const paymentStatus = mapGatewayStateToPaymentStatus(phonePeStatus.state);

    const update: Partial<OrderRecord> = {
        paymentStatus,
        paymentResponseCode: phonePeStatus.errorCode,
        paymentInstrument: latestPayment?.instrument,
        gatewayTransactionId: latestPayment?.transactionId,
        paymentMeta: {
            ...(orderData.paymentMeta ?? {}),
            phonePeStatus,
            lastReconciledAt: Date.now(),
        },
    };

    if (paymentStatus === "paid") {
        update.status = orderData.status === "pending" ? "confirmed" : orderData.status;

        if (!orderData.paymentCompletedAt) {
            update.paymentCompletedAt = admin.firestore.FieldValue.serverTimestamp();
        }
    }

    if (paymentStatus === "failed" && orderData.status === "pending") {
        update.status = "cancelled";
    }

    await orderDoc.ref.update(update);

    return {
        orderId: orderDoc.id,
        merchantOrderId,
        userId: orderData.userId,
        paymentStatus,
        status: update.status ?? orderData.status,
        gatewayState: phonePeStatus.state,
        gatewayTransactionId: latestPayment?.transactionId,
        amount: phonePeStatus.amount,
    };
}

router.post("/phonepe/initiate", authMiddleware, async (req: Request, res: Response) => {
    try {
        const { items, shippingAddress } = req.body as {
            items?: CheckoutItemInput[];
            shippingAddress?: unknown;
        };

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "items must be a non-empty array" });
        }

        if (!isShippingAddress(shippingAddress)) {
            return res.status(400).json({ error: "A valid shippingAddress is required" });
        }

        const canonicalItems = await buildCanonicalItems(items);
        const totalAmount = canonicalItems.reduce((sum, item) => sum + item.price * item.qty, 0);
        const orderRef = db.collection("orders").doc();
        const merchantOrderId = `order_${orderRef.id}`;
        const now = admin.firestore.FieldValue.serverTimestamp();

        const order: OrderRecord = {
            userId: req.user!.uid,
            type: "product",
            items: canonicalItems,
            totalAmount,
            status: "pending",
            shippingAddress,
            createdAt: now,
            paymentProvider: "phonepe",
            paymentStatus: "initiated",
            merchantOrderId,
            merchantTransactionId: merchantOrderId,
            paymentInitiatedAt: now,
            paymentMeta: {
                source: "phonepe-initiate",
            },
        };

        await orderRef.set(order);

        try {
            const phonePeOrder = await initiatePhonePePayment({
                merchantOrderId,
                amount: Math.round(totalAmount * 100),
                metaInfo: {
                    udf1: orderRef.id,
                    udf2: req.user!.uid,
                },
            });

            await orderRef.update({
                paymentMeta: {
                    source: "phonepe-initiate",
                    phonePeOrderId: phonePeOrder.orderId,
                    state: phonePeOrder.state,
                    expireAt: phonePeOrder.expireAt ?? phonePeOrder.expiryAt ?? null,
                },
            });

            return res.json({
                orderId: orderRef.id,
                merchantOrderId,
                merchantTransactionId: merchantOrderId,
                redirectUrl: phonePeOrder.redirectUrl,
                amount: totalAmount,
            });
        } catch (error) {
            await orderRef.update({
                paymentStatus: "failed",
                paymentMeta: {
                    source: "phonepe-initiate",
                    initiationError: error instanceof Error ? error.message : "Unknown PhonePe error",
                },
            });
            throw error;
        }
    } catch (err) {
        console.error("POST /payments/phonepe/initiate error:", err);
        return res.status(500).json({
            error: err instanceof Error ? err.message : "Internal server error",
        });
    }
});

router.post("/phonepe/retry/:orderId", authMiddleware, async (req: Request, res: Response) => {
    try {
        const orderId = String(req.params.orderId);
        const orderRef = db.collection("orders").doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return res.status(404).json({ error: "Order not found" });
        }

        const orderData = orderDoc.data() as OrderRecord;

        if (orderData.userId !== req.user!.uid) {
            return res.status(403).json({ error: "Forbidden" });
        }

        if (orderData.paymentProvider !== "phonepe") {
            return res.status(400).json({ error: "Only PhonePe orders can be retried" });
        }

        if (!["initiated", "pending", "failed"].includes(orderData.paymentStatus ?? "")) {
            return res.status(400).json({
                error: "Only initiated, pending, or failed PhonePe orders can be retried",
            });
        }

        const merchantOrderId = `order_${orderId}_${Date.now()}`;

        const phonePeOrder = await initiatePhonePePayment({
            merchantOrderId,
            amount: Math.round(orderData.totalAmount * 100),
            metaInfo: {
                udf1: orderId,
                udf2: req.user!.uid,
            },
        });

        await orderRef.update({
            status: "pending",
            paymentStatus: "initiated",
            merchantOrderId,
            merchantTransactionId: merchantOrderId,
            gatewayTransactionId: null,
            paymentResponseCode: null,
            paymentCompletedAt: null,
            paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentMeta: {
                ...(orderData.paymentMeta ?? {}),
                source: "phonepe-retry",
                phonePeOrderId: phonePeOrder.orderId,
                state: phonePeOrder.state,
                expireAt: phonePeOrder.expireAt ?? phonePeOrder.expiryAt ?? null,
                retriedAt: Date.now(),
            },
        });

        return res.json({
            orderId,
            merchantOrderId,
            merchantTransactionId: merchantOrderId,
            redirectUrl: phonePeOrder.redirectUrl,
            amount: orderData.totalAmount,
        });
    } catch (err) {
        console.error("POST /payments/phonepe/retry/:orderId error:", err);
        return res.status(500).json({
            error: err instanceof Error ? err.message : "Internal server error",
        });
    }
});

router.get("/phonepe/status/:merchantOrderId", authMiddleware, async (req: Request, res: Response) => {
    try {
        const merchantOrderId = String(req.params.merchantOrderId);
        const reconciledOrder = await reconcilePhonePeOrder(merchantOrderId);

        if (!reconciledOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (reconciledOrder.userId !== req.user!.uid) {
            return res.status(403).json({ error: "Forbidden" });
        }

        return res.json(reconciledOrder);
    } catch (err) {
        console.error("GET /payments/phonepe/status/:merchantOrderId error:", err);
        return res.status(500).json({
            error: err instanceof Error ? err.message : "Internal server error",
        });
    }
});

router.post("/phonepe/webhook", async (req: Request, res: Response) => {
    try {
        const merchantOrderId =
            typeof req.body?.merchantOrderId === "string"
                ? req.body.merchantOrderId
                : typeof req.body?.payload?.merchantOrderId === "string"
                  ? req.body.payload.merchantOrderId
                  : typeof req.body?.orderId === "string"
                    ? req.body.orderId
                    : typeof req.query.merchantOrderId === "string"
                      ? req.query.merchantOrderId
                      : "";

        if (!merchantOrderId) {
            return res.status(400).json({ error: "merchantOrderId is required" });
        }

        const reconciledOrder = await reconcilePhonePeOrder(merchantOrderId);

        if (!reconciledOrder) {
            return res.status(404).json({ error: "Order not found" });
        }

        return res.json({
            ok: true,
            merchantOrderId,
            paymentStatus: reconciledOrder.paymentStatus,
            status: reconciledOrder.status,
        });
    } catch (err) {
        console.error("POST /payments/phonepe/webhook error:", err);
        return res.status(500).json({
            error: err instanceof Error ? err.message : "Internal server error",
        });
    }
});

export default router;