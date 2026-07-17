export interface CategoryGridItem {
    id: string;
    title: string;
    rowSpan: number;
    colSpan: number;
    slides: Array<{
        image: string;
        link?: string;
        alt?: string;
    }>;
}