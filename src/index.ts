import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

import "./env";

import adminCustomPrintRoutes from "./routes/admin/customPrints";
import adminGptRoutes from "./routes/admin/gpt";
import adminOrderRoutes from "./routes/admin/orders";
import authRoutes from "./routes/auth";
import customPrintRoutes from "./routes/customPrints";
import orderRoutes from "./routes/orders";
import productRoutes from "./routes/products";
import reviewRoutes from "./routes/reviews";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
    cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        credentials: true,
    }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/products/:productId/reviews", reviewRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/custom-prints", customPrintRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/custom-prints", adminCustomPrintRoutes);
app.use("/api/admin", adminGptRoutes);

app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Route not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);

    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large" });
    }

    return res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
