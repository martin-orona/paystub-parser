import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, unlink, writeFile as fs_writeFile } from 'node:fs/promises';
import { join, extname, dirname, basename } from 'node:path';

export { fs_writeFile as writeFile };

export async function createDirectoryIfNotExists(path: string): Promise<void> {
    const exists = await directoryExists(path);
    if (!exists) {
        try {
            await mkdir(path, { recursive: true });
        } catch (error) {
            console.error(`Error creating directory: ${path}`, error);
            throw error;
        }
    }
}

export async function deleteFileIfExists(path: string): Promise<void> {
    const exists = await fileExists(path);
    if (exists) {
        try {
            await unlink(path);
        } catch (error) {
            console.error(`Error deleting file: ${path}`, error);
            throw error;
        }
    }
}

export async function directoryExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.F_OK);
        const stats = await stat(path);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

export async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

export function pathHasDirectory(filePath: string): boolean {
    return basename(filePath) !== filePath;
}
