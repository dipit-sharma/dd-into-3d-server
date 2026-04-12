const express = require("express");
const { db } = require("../../config/firebase");
const adminAuthMiddleware = require("../../middleware/adminAuth");

const router = express.Router();

const VALID_STATUSES = [
  "submitted",
  "quoted",
  "confirmed",
  "printing",
  "shipped",
];

/**
 * GET /api/admin/custom-prints — Admin only
 * Returns all custom print requests. Supports ?status= filter.
 */
router.get("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    let query = db
      .collection("custom_print_requests")
      .orderBy("createdAt", "desc");
    if (status && VALID_STATUSES.includes(status)) {
      query = db
        .collection("custom_print_requests")
        .where("status", "==", status)
        .orderBy("createdAt", "desc");
    }
    const snapshot = await query.get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.json({ requests });
  } catch (err) {
    console.error("admin GET /custom-prints error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/custom-prints/:id — Admin only
 * Returns a single custom print request by ID.
 */
router.get("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const doc = await db
      .collection("custom_print_requests")
      .doc(req.params.id)
      .get();
    if (!doc.exists)
      return res.status(404).json({ error: "Custom print request not found" });
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("admin GET /custom-prints/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/admin/custom-prints/:id/quote — Admin only
 * Sets a price quote for a custom print request and transitions status to "quoted".
 * Body: { quote: number, status?: string }
 */
router.put("/:id/quote", adminAuthMiddleware, async (req, res) => {
  try {
    const { quote, status } = req.body;
    if (quote == null || isNaN(Number(quote)) || Number(quote) < 0) {
      return res
        .status(400)
        .json({ error: "A valid quote amount is required" });
    }

    const update = { quote: Number(quote), status: "quoted" };
    if (status && VALID_STATUSES.includes(status)) {
      update.status = status;
    }

    const ref = db.collection("custom_print_requests").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Custom print request not found" });

    await ref.update(update);
    return res.json({ message: "Quote updated", ...update });
  } catch (err) {
    console.error("admin PUT /custom-prints/:id/quote error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/admin/custom-prints/:id/status — Admin only
 * Updates the status of a custom print request.
 * Body: { status: string }
 */
router.put("/:id/status", adminAuthMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    const ref = db.collection("custom_print_requests").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Custom print request not found" });

    await ref.update({ status });
    return res.json({ message: "Status updated", status });
  } catch (err) {
    console.error("admin PUT /custom-prints/:id/status error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
