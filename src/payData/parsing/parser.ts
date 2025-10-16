import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfDataPage, PdfDataPageDictionary, AppParams, PayData, PdfTextElement, TextItem } from '../../types.js';
import { isTextItem } from '../../types.ts';
import { handleError } from '../../utilities/errors.ts';
import { extractPayData_regex } from './regexParsing.ts';
import { TextLineElementSeparator } from './constants.ts';

export const TextLineSeparator = '\n';

export type ExtractDataParams = AppParams & {
  files: Array<string>;
  extractPayData: (parsedData: any) => Promise<PayData>;
};

export async function extractPayData(options: AppParams & { files: Array<string> }) {
  if (options.verbose) {
    console.log(`Extracting pay data using parser type: ${options.payDataParserType}`);
  }

  try {
    const extractor = getPayDataExtractor(options);
    const payData = await extractData({
      ...options,
      extractPayData: extractor,
    });
    return payData;
  } catch (error) {
    console.error('Error extracting pay data:', error);
    throw error;
  }
}

async function extractData(options: ExtractDataParams): Promise<PayData[]> {
  if (options.verbose) {
    console.log(`Extracting data from ${options.files.length} files.`);
  }

  const result: PayData[] = [];

  for (const file of options.files) {
    if (options.verbose) {
      console.log(`Extracting data from file (${result.length + 1} of ${options.files.length}): ${file}`);
    }

    const fileResult = await extract({ ...options, file });
    result.push(fileResult);
  }

  return result;

  async function extract(options: ExtractDataParams & { file: string }): Promise<PayData> {
    const file = options.file;

    let fileContent;
    try {
      fileContent = await readFile(file);

      if (options.verbose) {
        console.log(`Successfully read file: ${file}`);
      }
    } catch (error) {
      throw handleError({
        error,
        buildMessage: message => `Error extracting data from file. step:[read file] file:[${file}] reason: ${message}`,
      });
    }

    let pdfData;
    try {
      pdfData = await parsePdf({ ...options, toParse: fileContent });

      if (options.verbose) {
        console.log(`Successfully parsed PDF content from file: ${file}`);
      }
    } catch (error) {
      throw handleError({
        error,
        buildMessage: message => `Error extracting data from file. step:[parse pdf] file:[${file}] reason: ${message}`,
      });
    }

    let payData;
    try {
      payData = await options.extractPayData({ ...options, parsedPdfData: pdfData });

      if (options.verbose) {
        console.log(`Extracted pay data for file: ${file}`);
      }

      return payData;
    } catch (error) {
      throw handleError({
        error,
        buildMessage: message =>
          `Error extracting data from file. step:[parse pay data] file:[${file}] reason: ${message}`,
      });
    }
  }
}

async function parsePdf(options: ExtractDataParams & { toParse: Buffer }) {
  try {
    let data;
    switch (options.pdfParserType) {
      case 'pdf-parse':
        data = await parse_pdf_parse_with_delimiter_between_elements(options.toParse);
        break;
      case 'pdfjs':
        data = await parse_with_pdfjs(options.toParse);
        break;
      default:
        throw new Error(`Unsupported parser type: ${options.pdfParserType}`);
    }

    return data;
  } catch (error) {
    console.error(`Error parsing PDF data from file: ${options.inputFile}`, error);
    throw error;
  }

  async function parse_with_pdfjs(toParse_fileBuffer: Buffer) {
    const toParse = new Uint8Array(toParse_fileBuffer);
    const loadingTask = pdfjs.getDocument({ data: toParse });
    const pdfDocument = await loadingTask.promise;

    const numPages = pdfDocument.numPages;
    const paySourceData: PdfDataPageDictionary = {};
    let currentPage: PdfDataPage;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      currentPage = { pageNumber: pageNum, elements: {} };
      paySourceData[pageNum] = currentPage;

      for (let itemNum = 0; itemNum < textContent.items.length; itemNum++) {
        const item = textContent.items[itemNum];

        if (isTextItem(item)) {
          const textItem = item as TextItem;

          if (textItem.height === 0) {
            continue;
          }

          const count = Object.keys(currentPage.elements).length + 1;
          currentPage.elements[count] = {
            pageNumber: pageNum,
            itemNumber: count,
            text: textItem.str,
            x: textItem.transform[4],
            y: textItem.transform[5] - textItem.height,
            w: textItem.width,
            h: textItem.height,
          } as PdfTextElement;
        }
      }
    }

    return paySourceData;
  }

  async function parse_pdf_parse_with_delimiter_between_elements(toParse: Buffer) {
    const data = await pdfParse(options.toParse, { pagerender: my_render });
    return data;

    async function my_render(pageData: any) {
      // normalizeWhitespace is one of the options that can be passed to getTextContent(), which would replace all occurrences of whitespace with standard spaces (0x20). The default is false.
      const textContent = await pageData.getTextContent();
      if (textContent?.items?.length === 0) {
        return '';
      }

      const YPosition = 5;
      const lines: string[] = ['Beginning of Page'];
      let lineY = -1;
      let currentLine: string[] = [];

      for (let item of textContent.items) {
        const itemY = item.transform[YPosition];

        if (itemY !== lineY) {
          lines.push(currentLine.join(TextLineElementSeparator));
          currentLine = [];
          lineY = itemY;
        }

        currentLine.push(item.str);
      }

      if (currentLine.length > 0) {
        lines.push(currentLine.join(TextLineElementSeparator));
      }

      const text = lines.join(TextLineSeparator) + '\nEnd of Page';
      return text;
    }
  }
}

function getPayDataExtractor(options: AppParams): (parsedData: any) => Promise<PayData> {
  switch (options.payDataParserType) {
    case 'regex':
      return extractPayData_regex;
    default:
      throw new Error(`Unknown pay data parser type: ${options.payDataParserType}`);
  }
}
