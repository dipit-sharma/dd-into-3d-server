const express = require("express");
const multer = require("multer");
const { db, admin } = require("../config/firebase");
const adminAuthMiddleware = require("../middleware/adminAuth");
const { uploadFile, sanitizeFilename } = require("../utils/storage");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per image
});

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * GET /api/products
 * Lists all products. Supports ?category=, ?search=, ?page=, ?limit=
 */
router.get("/", async (req, res) => {
  try {
    const { category, search, page = "1", limit = "20" } = req.query;
    const pageSize = Math.min(parseInt(limit, 10) || 20, 100);

    let query = db.collection("products").orderBy("createdAt", "desc");
    if (category) {
      query = db
        .collection("products")
        .where("category", "==", category)
        .orderBy("createdAt", "desc");
    }

    const snapshot = await query.limit(pageSize).get();
    let products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (search) {
      const q = search.toLowerCase();
      products = products.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return res.json({
      products,
      total: products.length,
      page: parseInt(page, 10),
    });
  } catch (err) {
    console.error("GET /products error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/products/:id
 * Returns a single product by ID.
 */
router.get("/:id", async (req, res) => {
  try {
    const doc = await db.collection("products").doc(req.params.id).get();
    if (!doc.exists)
      return res.status(404).json({ error: "Product not found" });
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("GET /products/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/products — Admin only
 * Creates a new product.
 */
router.post("/", adminAuthMiddleware, async (req, res) => {
  try {
    const { name, description, price, category, stock, tags } = req.body;
    if (!name || price == null || !category) {
      return res
        .status(400)
        .json({ error: "name, price, and category are required" });
    }
    const product = {
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      price: Number(price),
      category: String(category).trim(),
      stock: stock != null ? Number(stock) : 0,
      tags: Array.isArray(tags) ? tags : [],
      images: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection("products").add(product);
    return res.status(201).json({ id: ref.id, ...product });
  } catch (err) {
    console.error("POST /products error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/products/:id — Admin only
 * Updates an existing product.
 */
router.put("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const ref = db.collection("products").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Product not found" });

    const { name, description, price, category, stock, tags } = req.body;
    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (description !== undefined)
      update.description = String(description).trim();
    if (price !== undefined) update.price = Number(price);
    if (category !== undefined) update.category = String(category).trim();
    if (stock !== undefined) update.stock = Number(stock);
    if (tags !== undefined) update.tags = Array.isArray(tags) ? tags : [];

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    await ref.update(update);
    return res.json({ message: "Product updated" });
  } catch (err) {
    console.error("PUT /products/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/products/:id — Admin only
 * Deletes a product.
 */
router.delete("/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const ref = db.collection("products").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists)
      return res.status(404).json({ error: "Product not found" });
    await ref.delete();
    return res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("DELETE /products/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/products/:id/images — Admin only
 * Uploads product images to Firebase Storage and appends URLs to the product doc.
 */
router.post(
  "/:id/images",
  adminAuthMiddleware,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const { id } = req.params;
      const ref = db.collection("products").doc(id);
      const doc = await ref.get();
      if (!doc.exists)
        return res.status(404).json({ error: "Product not found" });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }

      const urls = [];
      for (const file of req.files) {
        if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
          return res
            .status(400)
            .json({ error: `Unsupported image type: ${file.mimetype}` });
        }
        const filename = `${Date.now()}_${sanitizeFilename(file.originalname)}`;
        const url = await uploadFile(
          file.buffer,
          `products/${id}/${filename}`,
          file.mimetype,
        );
        urls.push(url);
      }

      await ref.update({
        images: admin.firestore.FieldValue.arrayUnion(...urls),
      });
      return res.json({ images: urls });
    } catch (err) {
      console.error("POST /products/:id/images error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

module.exports = router;
