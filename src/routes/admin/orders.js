const express = require("express");
const { db } = require("../../config/firebase");
const adminAuthMiddleware = require("../../middleware/adminAuth");

const router = express.Router();

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
];

/**
 * GET /api/admin/orders — Admin only
 * Returns all orders. Supports ?status= filter.
 */
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    let query = db.collection("orders").orderBy("createdAt", "desc");
    if (status && VALID_STATUSES.includes(status)) {
      query = db
        .collection("orders")
        .where("status", "==", status)
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

/**
 * GET /api/admin/orders/:id — Admin only
 * Returns a single order by ID.
 */
router.get("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const doc = await db.collection("orders").doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("admin GET /orders/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/admin/orders/:id/status — Admin only
 * Updates the status of an order.
 * Body: { status: "confirmed" | "shipped" | "delivered" | "cancelled" }
 */
router.put("/:id/status", adminAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    const ref = db.collection("orders").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Order not found" });
    await ref.update({ status });
    return res.json({ message: "Order status updated", status });
  } catch (err) {
    console.error("admin PUT /orders/:id/status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
