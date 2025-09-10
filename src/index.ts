import { parseArgs } from 'node:util';
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { pathHasDirectory } from './file.io.ts';
import { writeData } from './writer.ts';
import { extractData } from './parser.ts';


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

async function identifyPayFiles(options: { directory: string; inputFile: string | undefined; inputFilePattern: string | undefined; inputFilePatternFlags: string | undefined; verbose: boolean; }) {
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

async function writePayData(options: { directory: string; outputFile: string | undefined; verbose: boolean; payData: object; prepareTableData: (data: object) => object[]; }) {
  if (options.verbose) {
    console.log(`Writing out pay data`);
  }

  try {
    const outputFile = await getOutputFilePath(options);
    await writeData({ ...options, output: outputFile });
  } catch (error) {
    console.error('Error writing pay data:', error);
    throw error;
  }
}

function parseArguments() {
  const { values: ui_params } = parseArgs({
    options: {
      directory: { type: 'string', short: 'd', default: `${process.cwd()}/input` },
      file: { type: 'string', short: 'f' },
      "file-pattern": { type: 'string', short: 'p', default: '*.pdf' },
      "file-pattern-flags": { type: 'string', default: 'im' },
      // output: { type: 'string', short: 'o', default: 'output.json' },
      output: { type: 'string', short: 'o', default: 'output.xls' },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
  });

  const app_params = {
    directory: ui_params.directory,
    inputFile: ui_params.file || undefined,
    inputFilePattern: ui_params['file-pattern'] || undefined,
    inputFilePatternFlags: ui_params['file-pattern-flags'] || undefined,
    outputFile: ui_params.output,
    verbose: ui_params.verbose,
  };

  return app_params;
}


async function extractPayData(parsedData: any) {
  const content = parsedData.text;
  const payData = { check: {}, grossEarnings: {}, taxes: {}, deductions: {}, deposits: {} };


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

  function extractData(content: string, group: string, regex: RegExp): string | null {
    const match = content.match(regex);
    return match ? match.groups![group] : null;
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

function prepareTableData(payData: object) {
  if (Array.isArray(payData)) {
    // If payData is an array, flatten each item and return an array of flat objects
    return payData.map(item => prepareTableData(item)).sort((a, b) => {
      const dateA = new Date(a['Check Date']);
      const dateB = new Date(b['Check Date']);
      // sort dates in descending order
      return dateB.getTime() - dateA.getTime();
    });
  }

  // If payData is a single object, flatten it and return the flat object
  const flatData: any = {
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
