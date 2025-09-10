import { readFile } from 'fs/promises';
import pdfParse from 'pdf-parse';

export async function extractData(options: { files: Array<string>; outputFile: string | undefined; verbose: boolean; extractPayData: (parsedData: any) => Promise<any>; }) {
    if (options.verbose) {
        console.log(`Extracting data from ${options.files.length} files.`);
    }

    const result: any[] = [];

    for (const file of options.files) {
        const fileResult = await extract({ ...options, file });
        result.push(fileResult);
    }

    return result;

    async function extract(options: { file: string; verbose: boolean; extractPayData: (parsedData: any) => Promise<any>; }) {
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

export async function parsePdf(options: { file: string; verbose: boolean; toParse: Buffer; }) {
    try {
        const data = await pdfParse(options.toParse);

        if (options.verbose) {
            console.log(`Successfully parsed PDF content from file: ${options.file}`);
        }

        return data;
    } catch (error) {
        console.error(`Error parsing PDF data from file: ${options.file}`, error);
        throw error;
    }
}
