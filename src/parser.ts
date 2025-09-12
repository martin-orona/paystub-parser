import { readFile } from 'fs/promises';
import pdfParse from 'pdf-parse';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { AppParams, PayData } from './types.js';

export type ExtractDataParams = AppParams & { files: Array<string>; extractPayData: (parsedData: any) => Promise<PayData>; };

export async function extractData(options: ExtractDataParams): Promise<PayData[]> {
    if (options.verbose) {
        console.log(`Extracting data from ${options.files.length} files.`);
    }

    const result: PayData[] = [];

    for (const file of options.files) {
        const fileResult = await extract({ ...options, file });
        result.push(fileResult);
    }

    return result;

    async function extract(options: ExtractDataParams & { file: string; }): Promise<PayData> {
        const file = options.file;

        if (options.verbose) {
            console.log(`Extracting data from file: ${file}`);
        }

        let fileContent;
        try {
            fileContent = await readFile(file);
            if (options.verbose) {
                console.log(`Successfully read file: ${file}`);
            }
        } catch (error) {
            const message = `Error extracting data from file. step:[read file] file:[${file}] reason: ${error.message}`;
            console.error(message);
            error.message = message;
            throw error;
        }

        let pdfData;
        try {
            pdfData = await parsePdf({ ...options, toParse: fileContent });
        } catch (error) {
            const message = `Error extracting data from file. step:[parse pdf] file:[${file}] reason: ${error.message}`;
            console.error(message);
            error.message = message;
            throw error;
        }

        let payData;
        try {
            payData = await options.extractPayData(pdfData);

            if (options.verbose) {
                console.log(`Extracted pay data for file: ${file}`);
            }

            return payData;
        } catch (error) {
            const message = `Error extracting data from file. step:[parse pay data] file:[${file}] reason: ${error.message}`;
            console.error(message);
            error.message = message;
            throw error;
        }

    }
}

export async function parsePdf(options: ExtractDataParams & { toParse: Buffer; }) {
    try {
        const data = await parse_pdf_parse(options.toParse);

        if (options.verbose) {
            console.log(`Successfully parsed PDF content from file: ${options.inputFile}`);
        }

        return data;
    } catch (error) {
        console.error(`Error parsing PDF data from file: ${options.inputFile}`, error);
        throw error;
    }


    async function parse_pdf_parse(toParse: Buffer) {
        const data = await pdfParse(options.toParse);
        return data;
    }
}
