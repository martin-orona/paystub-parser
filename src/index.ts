import { parseArgs } from 'node:util';
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { pathHasDirectory } from './file.io.ts';
import { writeData } from './writer.ts';
import { extractData } from './parser.ts';
import type { AppParams, FlatPayData, ParserType, PayData } from './types.ts';


run();


async function run() {
  try {
    const options = parseArguments();
    const files = await identifyPayFiles(options);
    const payData = await extractData({ ...options, files, extractPayData });
    await writePayData({ ...options, payData, prepareTableData });
    console.log('Processing completed successfully.');
  }
  catch (error) {
    console.error('Error during processing:', error);
    throw error;
  }
}

async function identifyPayFiles(options: AppParams): Promise<string[]> {
  if (options.inputFile) {
    return [join(options.directory, options.inputFile)];
  }

  if (options.verbose) {
    console.log('Identifying files in directory:', options.directory);
  }

  try {
    const allItems = (await readdir(options.directory, { withFileTypes: true }));
    const allFiles = allItems.filter(item => item.isFile());
    const pdfFiles = allFiles.filter(file => extname(file.name).toLowerCase() === '.pdf');
    const files = pdfFiles.map(file => join(options.directory, file.name));
    if (!options.inputFilePattern) {
      return files;
    }
    else {
      const regex = new RegExp(options.inputFilePattern, options.inputFilePatternFlags);
      const matchedFiles = files.filter(file => regex.test(file));
      return matchedFiles;
    }
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
}

async function writePayData(options: AppParams & { payData: PayData[]; prepareTableData: (data: PayData[]) => FlatPayData[]; }) {
  if (options.verbose) {
    console.log(`Writing out pay data`);
  }

  try {
    const outputFile = await getOutputFilePath(options);
    await writeData({ ...options, outputFile });
  } catch (error) {
    console.error('Error writing pay data:', error);
    throw error;
  }
}

function parseArguments(): AppParams {
  const uiArgs = getArgs();
  validateArgs(uiArgs);
  const appArgs = getAppArgs(uiArgs);
  return appArgs;

  interface UIParams {
    directory: string;
    file?: string;
    "file-pattern": string;
    "file-pattern-flags": string;
    "parser-type": string;
    output: string;
    verbose: boolean;
  }


  function getArgs() {
    const { values: ui_params }: { values: UIParams } = parseArgs({
      options: {
        directory: { type: 'string', short: 'd', default: `${process.cwd()}/input` },
        file: { type: 'string', short: 'f' },
        "file-pattern": { type: 'string', short: 'p', default: '*.pdf' },
        "file-pattern-flags": { type: 'string', default: 'im' },
        "parser-type": { type: 'string', default: 'pdf-parse' },
        // output: { type: 'string', short: 'o', default: 'output.json' },
        output: { type: 'string', short: 'o', default: 'output.xls' },
        verbose: { type: 'boolean', short: 'v', default: false },
      },
    });
    return ui_params;
  }

  function validateArgs(args: UIParams) {

    validateValueInList(args, 'parser-type', ['pdf-parse', 'pdf-lib']);

    return true;

    function validateValueInList(args: UIParams, key: string, valid: string[]) {
      const value = args[key];
      if (!valid.includes(value)) {
        throw new Error(`Invalid value provided for parameter, please provide one of the valid options. parameter:[--${key}] provided:[${value}] valid:[${valid.join(', ')}]`);
      }
    }
  }

  function getAppArgs(uiArgs: UIParams): AppParams {
    const appArgs: AppParams = {
      directory: uiArgs.directory,
      inputFile: uiArgs.file || undefined,
      inputFilePattern: uiArgs['file-pattern'] || undefined,
      inputFilePatternFlags: uiArgs['file-pattern-flags'] || undefined,
      parserType: uiArgs['parser-type'] as ParserType,
      outputFile: uiArgs.output,
      verbose: uiArgs.verbose,
    };
    return appArgs;
  }
}


async function extractPayData(parsedData: any): Promise<PayData> {
  const content = parsedData.text;
  const payData = {} as PayData;


  const moneyValue = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?';
  const decimalNumberValue = '\\d+(?:\\.\\d{2})?';
  const dateValue = '\\w+ \\d{1,2}, \\d{4}';

  payData.check = {
    checkNumber: extractData(content, 'checkNumber', /^Voucher Number(?<checkNumber>\d+)$/m),
    checkDate: extractData(content, 'checkDate', new RegExp(`^.*Check Date(?<checkDate>${dateValue})$`, 'm')),
    payPeriodStart: extractData(content, 'payPeriodStart', new RegExp(`^.*Period Beginning(?<payPeriodStart>${dateValue})$`, 'm')),
    payPeriodEnd: extractData(content, 'payPeriodEnd', new RegExp(`^.*Period Ending(?<payPeriodEnd>${dateValue})$`, 'm')),
    salary: extractData(content, 'salary', new RegExp(`^Salary\\$(?<salary>${moneyValue}).*$`, 'm')),
    netPay: extractData(content, 'netPay', new RegExp(`^.*Net Pay(?<netPay>${moneyValue}).*$`, 'm')),
    fedTaxIncome: extractData(content, 'fedTaxIncome', new RegExp(`^.*Fed Taxable Income(?<fedTaxIncome>${moneyValue}).*$`, 'm')),
    hoursWorked: extractData(content, 'hoursWorked', new RegExp(`^.*Total Hours Worked(?<hoursWorked>${decimalNumberValue}).*$`, 'm'))
  };
  payData.grossEarnings = {
    hours: extractData(content, 'hours', new RegExp(`^.*Gross Earnings(?<hours>${decimalNumberValue})(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
    period: extractData(content, 'period', new RegExp(`^.*Gross Earnings(?<hours>${decimalNumberValue})(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
    ytd: extractData(content, 'ytd', new RegExp(`^.*Gross Earnings(?<hours>${decimalNumberValue})(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
  };
  payData.taxes = {
    period: extractData(content, 'period', new RegExp(`^.*Taxes(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
    ytd: extractData(content, 'ytd', new RegExp(`^.*Taxes(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
  };
  payData.deductions = {
    period: extractData(content, 'period', new RegExp(`^.*Deductions(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
    ytd: extractData(content, 'ytd', new RegExp(`^.*Deductions(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
  };
  payData.deposits = { total: extractData(content, 'deposited', new RegExp(`^.*Total Direct Deposits(?<deposited>${moneyValue}).*$`, 'm')) };


  return payData;

  function extractData(content: string, group: string, regex: RegExp): string {
    const match = content.match(regex);
    // return match ? match.groups![group] : null;
    if (match && match.groups![group]) {
      return match.groups![group];
    }

    throw new Error(`Unable to extract pay data. group:[${group}] regex:[${regex}]`);
  }
}

async function getOutputFilePath(options: { directory: string; outputFile: string | undefined; }): Promise<string> {
  const { outputFile: file, directory: dir } = options;
  if (!file) {
    throw new Error('Output file is not specified.');
  }

  const filePath = pathHasDirectory(file) ? file : join(dir, file);
  return filePath;
}

function prepareTableData(payData: PayData[]): FlatPayData[] {
  const result = payData.map(item => getFlatPayData(item)).sort((a, b) => {
    const dateA = new Date(a['Check Date']);
    const dateB = new Date(b['Check Date']);
    // sort dates in descending order
    return dateB.getTime() - dateA.getTime();
  });
  return result;


  function getFlatPayData(payData: PayData): FlatPayData {
    // If payData is a single object, flatten it and return the flat object
    const flatData: FlatPayData = {
      'Check Number': payData['check']?.['checkNumber'] || '',
      'Check Date': payData['check']?.['checkDate'] || '',
      'Pay Period Start': payData['check']?.['payPeriodStart'] || '',
      'Pay Period End': payData['check']?.['payPeriodEnd'] || '',
      'Salary': payData['check']?.['salary'] || '',
      'Net Pay': payData['check']?.['netPay'] || '',
      'Federal Taxable Income': payData['check']?.['fedTaxIncome'] || '',
      'Hours Worked': payData['check']?.['hoursWorked'] || '',
      'Gross Earnings Hours': payData['grossEarnings']?.['hours'] || '',
      'Gross Earnings Period': payData['grossEarnings']?.['period'] || '',
      'Gross Earnings YTD': payData['grossEarnings']?.['ytd'] || '',
      'Taxes Period': payData['taxes']?.['period'] || '',
      'Taxes YTD': payData['taxes']?.['ytd'] || '',
      'Deductions Period': payData['deductions']?.['period'] || '',
      'Deductions YTD': payData['deductions']?.['ytd'] || '',
      'Total Direct Deposits': payData['deposited'] || '',
    };
    return flatData;
  }
}
