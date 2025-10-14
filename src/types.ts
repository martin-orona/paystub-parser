import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api.d.ts';
export type { TextItem, TextMarkedContent };

export type PdfParserType = 'pdf-parse' | 'pdfjs';
export type PayDataParserType =
  /** Use regular expressions to parse text pay data. All the text in the document is searched as one big string, with each text element in the same row/line being merged together with no spaces to separate them. */
  | 'regex'
  /** use text element position withint the document to parse pay data. */
  | 'position-index';

export interface UIParams {
  directory: string;
  file?: string;
  'file-pattern': string;
  'file-pattern-flags': string;
  'pdf-parser-type': string;
  'pay-data-parser-type': string;
  'pay-data-regex-parsing-rules': string;
  output: string;
  verbose: boolean;
}
export type UIParamKeys = keyof UIParams;
export type UIParamValueTypes = UIParams[UIParamKeys];

export type AppParams = {
  directory: string;
  inputFile?: string;
  inputFilePattern?: string;
  inputFilePatternFlags?: string;
  pdfParserType: PdfParserType;
  payDataParserType: PayDataParserType;
  payDataRegexParsingRules?: JsonLiteral | FilePath;
  outputFile: string;
  verbose: boolean;
};

export type StringDictionary = { [key: string]: string };

export function isStringDictionary(candidate: any): candidate is StringDictionary {
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate);
}

export type JsonLiteral = string;

export type FilePath = string;

export type PayData = {
  check: {
    checkNumber?: string;
    checkDate: string;
    payPeriodStart: string;
    payPeriodEnd: string;
    salary: string;
    netPay: string;
    fedTaxIncome: string;
    hoursWorked: string;
  };
  grossEarnings: {
    hours: string;
    period: string;
    ytd: string;
    regularRate: string;
  };
  taxes: {
    period: string;
    ytd: string;
  };
  deductions: {
    period: string;
    ytd: string;
  };
  deposits: {
    total: string;
  };
};

export type FlatPayData = {
  'Check Number': string;
  'Check Date': string;
  'Pay Period Start': string;
  'Pay Period End': string;
  Salary: string;
  'Net Pay': string;
  'Federal Taxable Income': string;
  'Hours Worked': string;
  'Gross Earnings Hours': string;
  'Gross Earnings Period': string;
  'Gross Earnings YTD': string;
  'Taxes Period': string;
  'Taxes YTD': string;
  'Deductions Period': string;
  'Deductions YTD': string;
  'Total Direct Deposits': string;
  'Regular Hourly Rate': string;
};

export type PdfDataPageDictionary = { [page: number]: PdfDataPage };
export type PdfTextElementDictionary = { [element: number]: PdfTextElement };

export type PdfDataPage = {
  pageNumber: number;
  elements: PdfTextElementDictionary;
};

export type PdfTextElement = {
  // The page number of the page the item is part of. 1-based.
  pageNumber: number;
  // The item number within the page. 1-based.
  itemNumber: number;
  // The text content of the item.
  text: string;
  // Item location. The x-coordinate of the item in the PDF's coordinate space.
  x: number;
  // Item location. The y-coordinate of the item in the PDF's coordinate space.
  y: number;
  // Item location. The width of the item in the PDF's coordinate space.
  w: number;
  // Item location. The height of the item in the PDF's coordinate space.
  h: number;
};

export function isTextItem(item: any /* TextItem | TextMarkedContent */): item is TextItem {
  return (
    item &&
    typeof item.str === 'string' &&
    Array.isArray(item.transform) &&
    typeof item.transform[4] === 'number' &&
    typeof item.transform[5] === 'number' &&
    typeof item.width === 'number' &&
    typeof item.height === 'number'
  );
}
