import { readFile } from 'node:fs/promises';
import pdfParse from 'pdf-parse';
// import { PDFDocumentLoadingTask } from 'pdfjs-dist';
// import * as pdfjs from 'pdfjs-dist/build/pdf';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  //   isTextItem,
  PdfDataPage,
  PdfDataPageDictionary,
  AppParams,
  PayData,
  PdfTextElement,
  TextItem,
} from './types.js';
import { isTextItem } from './types.ts';
import { text } from 'node:stream/consumers';

// export const TextLineSeparator = '\n||';
export const TextLineSeparator = '\n';
export const TextLineElementSeparator = ' | ';

export type ExtractDataParams = AppParams & { files: Array<string>; extractPayData: (parsedData: any) => PayData };

export async function extractData(options: ExtractDataParams): Promise<PayData[]> {
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
      const message = `Error extracting data from file. step:[read file] file:[${file}] reason: ${error.message}`;
      console.error(message);
      error.message = message;
      throw error;
    }

    let pdfData;
    try {
      pdfData = await parsePdf({ ...options, toParse: fileContent });

      if (options.verbose) {
        console.log(`Successfully parsed PDF content from file: ${file}`);
      }
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

export async function parsePdf(options: ExtractDataParams & { toParse: Buffer }) {
  try {
    let data;
    switch (options.pdfParserType) {
      case 'pdf-parse':
        // data = await parse_with_pdf_parse(options.toParse);
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

  async function parse_with_pdf_parse(toParse: Buffer) {
    // const data = await parse_pdf_parse_assisted_by_pdf_parse(options.toParse);
    const data = await parse_pdf_parse_basic(toParse);
    return data;
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

    // return { meta: { pageCount: numPages }, data: paySourceData };
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

    function my_render_v0(pageData: any) {
      let render_options = {
        //replaces all occurrences of whitespace with standard spaces (0x20). The default value is `false`.
        normalizeWhitespace: false,
        //do not attempt to combine same line TextItem's. The default value is `false`.
        disableCombineTextItems: false,
      };

      return pageData.getTextContent(render_options).then(function (textContent: any) {
        let lastY,
          text = '';
        //https://github.com/mozilla/pdf.js/issues/8963
        //https://github.com/mozilla/pdf.js/issues/2140
        //https://gist.github.com/hubgit/600ec0c224481e910d2a0f883a7b98e3
        //https://gist.github.com/hubgit/600ec0c224481e910d2a0f883a7b98e3
        for (let item of textContent.items) {
          if (lastY == item.transform[5] || !lastY) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }
        //let strings = textContent.items.map(item => item.str);
        //let text = strings.join("\n");
        //text = text.replace(/[ ]+/ig," ");
        //ret.text = `${ret.text} ${text} \n\n`;
        return text;
      });
    }
  }

  async function parse_pdf_parse_basic(toParse: Buffer) {
    const data = await pdfParse(toParse);
    return data;
  }

  // async function parse_pdf_lib(toParse: Buffer) {
  //   const pdfDoc = await PDFDocument.load(toParse);
  //   const pages = pdfDoc.getPages();
  //   const firstPage = pages[0];
  //   const { width, height } = firstPage.getSize();

  //   return { text: 'PDF modified successfully.', numpages: pages.length, info: pdfDoc.getInfo() };
  // }
}
