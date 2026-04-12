const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { db, admin } = require("../config/firebase");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

/**
 * POST /api/orders/create-razorpay-order — Auth required
 * Creates a Razorpay order and returns the order ID for the frontend checkout.
 * Body: { items: [{ productId, name, price, qty }], shippingAddress: {} }
 */
router.post("/create-razorpay-order", authMiddleware, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items must be a non-empty array" });
    }
    if (!shippingAddress) {
      return res.status(400).json({ error: "shippingAddress is required" });
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );
    const razorpay = getRazorpay();
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // convert to paise
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

/**
 * POST /api/orders/verify-payment — Auth required
 * Verifies the Razorpay HMAC signature and saves the confirmed order to Firestore.
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, items, shippingAddress }
 */
router.post("/verify-payment", authMiddleware, async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      items,
      shippingAddress,
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res
        .status(400)
        .json({
          error:
            "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required",
        });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items must be a non-empty array" });
    }

    // Verify HMAC signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res
        .status(400)
        .json({ error: "Payment verification failed: signature mismatch" });
    }

    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );

    const order = {
      userId: req.user.uid,
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

/**
 * GET /api/orders — Auth required
 * Returns the authenticated user's orders.
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const snapshot = await db
      .collection("orders")
      .where("userId", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ orders });
  } catch (err) {
    console.error("GET /orders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/orders/:id — Auth required
 * Returns a single order (only if it belongs to the requesting user).
 */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await db.collection("orders").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });
    const order = { id: doc.id, ...doc.data() };
    if (order.userId !== req.user.uid) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.json(order);
  } catch (err) {
    console.error("GET /orders/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
