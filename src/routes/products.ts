import express, { Request, Response } from "express";
import multer from "multer";
import { admin, db } from "../config/firebase";
import adminAuthMiddleware from "../middleware/adminAuth";
import { deleteFilesByPublicUrls, sanitizeFilename, uploadFile } from "../utils/storage";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

router.get("/", async (req: Request, res: Response) => {
    try {
        const { category, search, page = "1", limit = "20" } = req.query;
        const pageSize = Math.min(parseInt(String(limit), 10) || 20, 100);

        let query: FirebaseFirestore.Query = db
            .collection("products")
            .orderBy("createdAt", "desc");

        if (category) {
            query = db
                .collection("products")
                .where("category", "array-contains", String(category))
                .orderBy("createdAt", "desc");
        }

        const snapshot = await query.limit(pageSize).get();
        let products = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        if (search) {
            const q = String(search).toLowerCase();
            products = products.filter(
                (p) =>
                    String((p as Record<string, unknown>).name ?? "")
                        .toLowerCase()
                        .includes(q) ||
                    String((p as Record<string, unknown>).description ?? "")
                        .toLowerCase()
                        .includes(q) ||
                    (((p as Record<string, unknown>).tags as string[] | undefined) ?? []).some((t) =>
                        t.toLowerCase().includes(q),
                    ),
            );
        }

        return res.json({
            products,
            total: products.length,
            page: parseInt(String(page), 10),
        });
    } catch (err) {
        console.error("GET /products error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get("/:id", async (req: Request, res: Response) => {
    try {
        const productId = String(req.params.id);
        const doc = await db.collection("products").doc(productId).get();
        if (!doc.exists) return res.status(404).json({ error: "Product not found" });
        return res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
        console.error("GET /products/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.post("/", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const { name, description, price, category, stock, tags } = req.body as Record<string, unknown>;
        if (!name || price == null || !category) {
            return res.status(400).json({ error: "name, price, and category are required" });
        }

        const normalizedCategory = Array.isArray(category)
            ? category.map((item) => String(item).trim()).filter(Boolean)
            : [String(category).trim()];

        const product = {
            name: String(name).trim(),
            description: description ? String(description).trim() : "",
            price: Number(price),
            category: normalizedCategory,
            stock: stock != null ? Number(stock) : 0,
            tags: Array.isArray(tags) ? tags : [],
            images: [] as string[],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const ref = await db.collection("products").add(product);
        return res.status(201).json({ id: ref.id, ...product });
    } catch (err) {
        console.error("POST /products error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.put("/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const productId = String(req.params.id);
        const ref = db.collection("products").doc(productId);
        const doc = await ref.get();
        if (!doc.exists) return res.status(404).json({ error: "Product not found" });

        const { name, description, price, category, stock, tags } = req.body as Record<string, unknown>;
        const update: Record<string, unknown> = {};

        if (name !== undefined) update.name = String(name).trim();
        if (description !== undefined) update.description = String(description).trim();
        if (price !== undefined) update.price = Number(price);
        if (category !== undefined) {
            update.category = Array.isArray(category)
                ? category.map((item) => String(item).trim()).filter(Boolean)
                : [String(category).trim()];
        }
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

router.delete("/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
        const productId = String(req.params.id);
        const ref = db.collection("products").doc(productId);
        const doc = await ref.get();
        if (!doc.exists) return res.status(404).json({ error: "Product not found" });

        const product = doc.data() as { images?: unknown };
        const imageUrls = Array.isArray(product.images)
            ? product.images.filter((img): img is string => typeof img === "string")
            : [];

        await deleteFilesByPublicUrls(imageUrls);

        await ref.delete();
        return res.json({ message: "Product deleted" });
    } catch (err) {
        console.error("DELETE /products/:id error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.post(
    "/:id/images",
    adminAuthMiddleware,
    upload.array("images", 10),
    async (req: Request, res: Response) => {
        try {
            const id = String(req.params.id);
            const ref = db.collection("products").doc(id);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: "Product not found" });

            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No images provided" });
            }

            const urls: string[] = [];
            for (const file of files) {
                if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
                    return res.status(400).json({ error: `Unsupported image type: ${file.mimetype}` });
                }

                const filename = `${Date.now()}_${sanitizeFilename(file.originalname)}`;
                const url = await uploadFile(file.buffer, `products/${id}/${filename}`, file.mimetype);
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

export default router;
