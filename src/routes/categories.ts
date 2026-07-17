import express, { Request, Response } from "express";
import { CategoryGridItem } from "../types/categories";

const router = express.Router();

const CATEGORIES: CategoryGridItem[] = [
    {
        id: "name_plate",
        title: "Name Plates",
        rowSpan: 1,
        colSpan: 3,
        slides: [{
            image: "https://firebasestorage.googleapis.com/v0/b/dd-into-3d.firebasestorage.app/o/assets%2F1784271622432_Gemini_Generated_Image_8eli1h8eli1h8eli.webp?alt=media&token=7b0bcd02-8318-47f3-a4bb-38929445f85c",
            link: "/products/ifMTONdeuNuQQVzI33Ci",
            alt: "Customized Name Plates"
        }]
    }
] as const;

router.get("/", (_req: Request, res: Response) => {
    return res.json({ categories: [...CATEGORIES] });
});

export default router;
