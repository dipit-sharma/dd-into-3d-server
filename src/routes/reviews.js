const express = require("express");
const { db, admin } = require("../config/firebase");
const authMiddleware = require("../middleware/auth");

// mergeParams allows access to :productId from the parent router
const router = express.Router({ mergeParams: true });

/**
 * GET /api/products/:productId/reviews
 * Returns all reviews for a product.
 */
router.get("/", async (req, res) => {
  try {
    const { productId } = req.params;
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

/**
 * POST /api/products/:productId/reviews — Auth required
 * Adds a review. One review per user per product.
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const { uid } = req.user;
    const { rating, comment } = req.body;

    const ratingNum = Number(rating);
    if (!rating || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "rating must be between 1 and 5" });
    }

    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists)
      return res.status(404).json({ error: "Product not found" });

    const existing = await db
      .collection("reviews")
      .where("productId", "==", productId)
      .where("userId", "==", uid)
      .get();
    if (!existing.empty) {
      return res
        .status(409)
        .json({ error: "You have already reviewed this product" });
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

module.exports = router;
