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
            image: "https://firebasestorage.googleapis.com/v0/b/dd-into-3d.firebasestorage.app/o/assets%2Fnameplatehero.PNG?alt=media&token=bca622aa-7738-451b-bede-ae0a4bbf3716",
            link: "/products/ifMTONdeuNuQQVzI33Ci",
            alt: "Customized Name Plates"
        }]
    },
    {
        id: "name_keychain",
        title: "Name Keychains",
        rowSpan: 1,
        colSpan: 1,
        slides: [{
            image: "https://firebasestorage.googleapis.com/v0/b/dd-into-3d.firebasestorage.app/o/assets%2FGemini_Generated_Image_1xqtv71xqtv71xqt.png?alt=media&token=fe4cee92-9084-4635-b92b-c98b222cf5d7",
            link: "",
            alt: "Customized Name Keychains"
        }]
    },
    {
        id: "name_keychain",
        title: "Name Keychains",
        rowSpan: 1,
        colSpan: 1,
        slides: [{
            image: "https://firebasestorage.googleapis.com/v0/b/dd-into-3d.firebasestorage.app/o/assets%2FGemini_Generated_Image_1xqtv71xqtv71xqt.png?alt=media&token=fe4cee92-9084-4635-b92b-c98b222cf5d7",
            link: "",
            alt: "Customized Name Keychains"
        }]
    }
] as const;

router.get("/", (_req: Request, res: Response) => {
    return res.json({ categories: [...CATEGORIES] });
});

export default router;
