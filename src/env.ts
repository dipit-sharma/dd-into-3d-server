import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../.env"),
    path.resolve(__dirname, "../../.env"),
];

const envPath = envPaths.find((candidatePath) => fs.existsSync(candidatePath));

dotenv.config(envPath ? { path: envPath } : undefined);
