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
} from '../../types.js';
import { isTextItem } from '../../types.ts';
// import { text } from 'node:stream/consumers';
import { handleError } from '../../utilities/errors.ts';
import { extractPayData_regex } from './regexParsing.ts';
import { TextLineElementSeparator } from './constants.ts';

// export const TextLineSeparator = '\n||';
export const TextLineSeparator = '\n';
export type ExtractDataParams = AppParams & { files: Array<string>; extractPayData: (parsedData: any) => PayData };

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
      payData = await options.extractPayData(pdfData);

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

function getPayDataExtractor(options: AppParams): (parsedData: any) => PayData {
  switch (options.payDataParserType) {
    case 'regex':
      return extractPayData_regex;
    case 'position-index':
      return extractPayData_positionIndex;
    default:
      throw new Error(`Unknown pay data parser type: ${options.payDataParserType}`);
  }
}

function extractPayData_positionIndex(content: PdfDataPageDictionary): PayData {
  const payData = {} as PayData;

  const page1AnchorElement = Object.values(content[1].elements).find((value, index, obj) => {
    // return value?.text === 'Non Negotiable - This is not a check - Non Negotiable';
    return value?.text === 'Earnings Statement';
  });

  payData.check = {
    checkNumber: extractData(content, {
      when: { text: 'Voucher Number', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }),
    checkDate: extractData(content, {
      when: { text: 'Check Date', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }) as string,
    payPeriodStart: extractData(content, {
      when: { text: 'Period Beginning', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }) as string,
    payPeriodEnd: extractData(content, {
      when: { text: 'Period Ending', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }) as string,
    salary: extractData(content, {
      when: { text: 'Salary', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    })?.replace(/^\$/, '') as string,
    netPay: extractData(content, {
      when: { text: 'Net Pay', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }) as string,
    fedTaxIncome: extractData(content, {
      when: { text: 'Fed Taxable Income', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }) as string,
    hoursWorked: extractData(content, {
      when: { text: 'Total Hours Worked', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
      extract: { position_offset: 1 },
    }) as string,
  };

  payData.grossEarnings = {
    hours: !worked(payData)
      ? '0.00'
      : (extractData(content, {
          when: { text: 'Gross Earnings', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
          extract: { position_offset: 1 },
        }) as string),
    period: !worked(payData)
      ? '0.00'
      : (extractData(content, {
          when: { text: 'Gross Earnings', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
          extract: { position_offset: 2 },
        }) as string),
    ytd: !worked(payData)
      ? ''
      : (extractData(content, {
          when: { text: 'Gross Earnings', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
          extract: { position_offset: 3 },
        }) as string),
    regularRate: !worked(payData)
      ? '0.00'
      : (extractData(content, {
          when: { text: 'REGULAR', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
          extract: { position_offset: 1 },
        }) as string),
  };

  const firstTaxesHeader = getWhenElement(content, {
    when: {
      text: 'Taxes',
      pageNumber: 1,
      itemNumberAfter: page1AnchorElement?.itemNumber,
    },
  });
  payData.taxes = {
    period: !worked(payData)
      ? '0.00'
      : (extractData(content, {
          when: { text: 'Taxes', pageNumber: 1, itemNumberAfter: firstTaxesHeader?.itemNumber },
          extract: { position_offset: 1 },
        }) as string),
    ytd: !worked(payData)
      ? ''
      : (extractData(content, {
          when: { text: 'Taxes', pageNumber: 1, itemNumberAfter: firstTaxesHeader?.itemNumber },
          extract: { position_offset: 2 },
        }) as string),
  };

  const firstDeductionsHeader = getWhenElement(content, {
    when: {
      text: 'Deductions',
      pageNumber: 1,
      itemNumberAfter: page1AnchorElement?.itemNumber,
    },
  });
  payData.deductions = {
    period:
      extractData(content, {
        when: {
          precondition: worked(payData),
          text: 'Deductions',
          pageNumber: 1,
          itemNumberAfter: firstDeductionsHeader?.itemNumber,
          and_not: 'No Deductions',
        },
        extract: { position_offset: 1 },
      }) || '0.00',
    ytd:
      // TODO: implement precondition for the other data points
      // !worked(payData)
      //   ? ''
      //   :
      extractData(content, {
        when: {
          precondition: worked(payData),
          text: 'Deductions',
          pageNumber: 1,
          itemNumberAfter: firstDeductionsHeader?.itemNumber,
          and_not: 'No Deductions',
        },
        extract: { position_offset: 2 },
      }) || '',
  };

  payData.deposits = {
    total: !gotPayed(payData)
      ? '0.00'
      : (extractData(content, {
          when: { text: 'Total Direct Deposits', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
          extract: { position_offset: 1 },
        }) as string),
  };

  return payData;

  function worked(payData: PayData): boolean {
    return parseFloat(payData.check.hoursWorked) !== 0;
  }

  function gotPayed(payData: PayData): boolean {
    return parseFloat(payData.check.netPay) !== 0;
  }

  function extractData(content: PdfDataPageDictionary, rule: any): string | undefined {
    const havePrecondition = 'precondition' in rule.when;
    const preconditionPassed = havePrecondition ? rule.when.precondition : true;
    if (!preconditionPassed) {
      return undefined;
    }

    const whenElement = getWhenElement(content, rule);
    if (!whenElement) {
      if (rule.when.and_not) {
        const whenNotElement = getWhenNotElement(content, rule);
        if (whenNotElement) {
          return undefined;
        } else {
          throw new Error(
            `Unable to find 'when' element. page:[${rule.when.page}] element:[${rule.when.element}] text:[${rule.when.text}]`
          );
        }
      }
    }

    const targetElement = getTargetElement(content, rule, whenElement);
    if (targetElement?.text) {
      return targetElement.text;
    }

    throw new Error('Not implemented');
  }

  function getWhenElement(content: PdfDataPageDictionary, rule: any): PdfTextElement | undefined {
    const whenElement = getElement_byCondition(content, rule, (element: PdfTextElement, index: number) => {
      if (!element?.text) {
        return false;
      }

      if (rule?.when?.pageNumber && element.pageNumber !== rule?.when?.pageNumber) {
        return false;
      }

      if (rule?.when?.itemNumberAfter && element.itemNumber <= rule.when.itemNumberAfter) {
        return false;
      }

      const sameText = element.text === rule.when.text;
      return sameText;
    });

    return whenElement;
  }

  function getWhenNotElement(content: PdfDataPageDictionary, rule: any): PdfTextElement | undefined {
    return getWhenElement(content, { ...rule, when: { ...rule.when, text: rule.when.and_not } });
  }

  function getTargetElement(
    content: PdfDataPageDictionary,
    rule: any,
    whenElement: PdfTextElement | undefined
  ): PdfTextElement | undefined {
    if (rule.extract?.position_offset) {
      return getElement_byPositionOffset(content, rule, whenElement);
    }

    return undefined;
  }

  function getElement_byPositionOffset(
    content: PdfDataPageDictionary,
    rule: any,
    whenElement: PdfTextElement | undefined
  ): PdfTextElement | undefined {
    if (!whenElement) {
      return undefined;
    }

    const targetPosition = whenElement.itemNumber + rule.extract.position_offset;
    const targetElement = getElement_byPosition(content, whenElement.pageNumber, targetPosition);
    return targetElement;
  }

  function getElement_byPosition(content: PdfDataPageDictionary, pageNumber: number, position: number): PdfTextElement {
    const page = content[pageNumber];
    if (!page) {
      throw new Error(`Unable to find pay data extraction rule element. 'when' page:[${pageNumber}]`);
    }

    const element = page.elements[position];
    return element;
  }

  function getElement_byCondition(
    content: PdfDataPageDictionary,
    rule: any,
    predicate: (element: PdfTextElement, index: number) => boolean
  ): PdfTextElement | undefined {
    if (!rule?.when) {
      return undefined;
    }

    const page = content[rule?.when?.pageNumber];
    if (!page) {
      throw new Error(`Unable to find pay data extraction rule element. 'when' page:[${rule.when.page}]`);
    }

    const elements = page.elements;

    const values = Object.values(elements ?? {});
    // TODO: change from dictionary to simple array
    // TODO: start after the indicated position, as an optimization
    // const whenElement = getElement_byCondition(values, (element: PdfTextElement, index: number) => {
    const element = values?.find(predicate);
    return element;
  }
}
