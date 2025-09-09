// parse command line arguments
import { parseArgs } from 'node:util';

import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';


import pdfParse from 'pdf-parse';


run();

async function run() {
  const options = parseCommand();

  try {
    const files = await identifyFiles(options);
    const payData = await extractData({ ...options, files });
    const outputed = await writeData({ ...options, payData });

  }
  catch (error) {
    console.error('Error during processing:', error);
    throw error;
  }


  async function identifyFiles(options: { directory: string; file: string; "file-pattern": string; "file-pattern-flags": string; verbose: boolean; }) {
    if (options.file) {
      return [join(options.directory, options.file)];
    }

    if (options.verbose) {
      console.log('Identifying files in directory:', options.directory);
    }

    try {
      const allItems = (await readdir(options.directory, { withFileTypes: true }));
      const allFiles = allItems.filter(item => item.isFile());
      const pdfFiles = allFiles.filter(file => extname(file.name).toLowerCase() === '.pdf');
      const files = pdfFiles.map(file => join(options.directory, file.name));
      if (!options["file-pattern"]) {
        return files;
      }
      else {
        const regex = new RegExp(options["file-pattern"], options["file-pattern-flags"]);
        const matchedFiles = files.filter(file => regex.test(file));
        return matchedFiles;
      }
    } catch (error) {
      console.error('Error reading directory:', error);
      throw error;
    }
  }

  async function extractData(options: { files: Array<string>; output: string; verbose: boolean; }) {
    if (options.verbose) {
      console.log(`Extracting data from ${options.files.length} files.`);
    }

    const result = [];

    for (const file of options.files) {
      const fileResult = await extract({ ...options, file });
      result.push(fileResult);
    }

    return result;

    async function extract(options: { file: string; verbose: boolean; }) {
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
        payData = await extractPayData(pdfData);

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

  async function writeData(options: { directory: string; output: string; verbose: boolean; payData: object; }) {
    if (options.verbose) {
      console.log(`Writing out pay data`);
    }

    try {
      await writePayData(options);
    } catch (error) {
      console.error('Error writing pay data:', error);
      throw error;
    }
  }

  // async function processFile(options: { directory: string; file: string; output: string; verbose: boolean; }) {
  //   if (options.verbose) {
  //     console.log(`Processing file: ${options.file}`);
  //   }

  //   let fileContent;
  //   try {
  //     fileContent = await readFile(options.file);
  //     if (options.verbose) {
  //       console.log(`Successfully read file: ${options.file}`);
  //     }
  //   } catch (error) {
  //     console.error(`Error reading file: ${options.file}`, error);
  //     throw error;
  //   }

  //   let pdfData;
  //   try {
  //     pdfData = await parsePdf({ ...options, toParse: fileContent });
  //   } catch (error) {
  //     console.error(`Error parsing file: ${options.file}`, error);
  //     throw error;
  //   }

  //   let payData;
  //   try {
  //     payData = await extractPayData(pdfData);

  //     if (options.verbose) {
  //       console.log(`Extracted pay data for file: ${options.file}`, pdfData);
  //     }
  //   } catch (error) {
  //     console.error(`Error extracting pay data from file: ${options.file}`, error);
  //     throw error;
  //   }

  //   try {
  //     await writePayData({ ...options, payData });
  //   } catch (error) {
  //     console.error(`Error writing data for file: ${options.file}`, error);
  //     throw error;
  //   }
  // }

  async function parsePdf(options: { file: string; verbose: boolean; toParse: Buffer; }) {
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

  async function extractPayData(parsedData: any) {
    const content = parsedData.text;
    const payData = {};


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
    payData.deposited = extractData(content, 'deposited', new RegExp(`^.*Total Direct Deposits(?<deposited>${moneyValue}).*$`, 'm'));


    return payData;

    function extractData(content: string, group: string, regex: RegExp): string | null {
      const match = content.match(regex);
      return match ? match.groups![group] : null;
    }
  }

  async function writePayData(options: { directory: string; output: string; verbose: boolean; payData: object; }) {
    if (options.verbose) {
      console.log(`Writing data to output file: ${options.output}`);
    }

    const file = await getOutputFilePath(options);
    await deleteFileIfExists(file);
    await createDirectoryIfNotExists(dirname(file));
    await writePayDataToFile({ ...options, outputFile: file, payData: options.payData });

    async function writePayDataToFile(options: { outputFile: string; verbose: boolean; payData: object; }) {
      const { outputFile, payData } = options;
      const fileExtension = extname(outputFile).toLowerCase();

      switch (fileExtension) {
        case '.json':
          await writeJson({ path: outputFile, payData });
          break;
        case '.xlsx':
        case '.xls':
          await writeExcel({ path: outputFile, payData });
          break;
        default:
          throw new Error(`Unsupported output file format: ${fileExtension}`);
      }
    }

  }

  async function getOutputFilePath(options: { directory: string; output: string; }): Promise<string> {
    const { output: file, directory: dir } = options;
    const filePath = pathHasDirectory(file) ? file : join(dir, file);
    return filePath;
  }

  async function createDirectoryIfNotExists(path: string): Promise<void> {
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

  function pathHasDirectory(filePath: string): boolean {
    return basename(filePath) !== filePath;
  }

  async function directoryExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async function fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async function deleteFileIfExists(path: string): Promise<void> {
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

  function parseCommand() {
    const { values } = parseArgs({
      options: {
        directory: { type: 'string', short: 'd', default: `${process.cwd()}/test-data` },
        file: { type: 'string', short: 'f' },
        "file-pattern": { type: 'string', short: 'p', default: '*.pdf' },
        "file-pattern-flags": { type: 'string', default: 'im' },
        // output: { type: 'string', short: 'o', default: 'output.json' },
        output: { type: 'string', short: 'o', default: 'output.xls' },
        verbose: { type: 'boolean', short: 'v', default: false },
      },
    });

    return values;

  }
}


async function writeJson(options: { path: string, payData: object }) {
  const { path, payData } = options;
  try {
    await writeFile(path, JSON.stringify(payData, null, 2));
  } catch (error) {
    console.error(`Error writing data to file: ${path}`, error);
    throw error;
  }
}

async function writeExcel(options: { path: string, payData: object }) {
  const { path, payData } = options;
  const tableData = prepareTableData(payData)
  const htmlContent = generateHtmlTable(tableData);

  try {
    await writeFile(path, htmlContent);
  } catch (error) {
    console.error(`Error writing Excel file: ${path}`, error);
    throw error;
  }
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

function generateHtmlTable(payData: object[]) {
  const html = `<html>
<head>
</head>
<body>
  <table>
    <thead>
      <tr>
        ${buildHeaders(payData)}
      </tr>
    </thead>
    <tbody>
      ${buildDataRows(payData)}
    </tbody>
  </table>
</body>
</html>
  `;

  return html;

  function buildHeaders(data: object) {
    const source = Array.isArray(data) ? data[0] : data;

    if (typeof source !== 'object' || source === null) {
      throw new Error('Invalid data format for building headers.');
    }

    const headers = Object.keys(source).map(key => `<th>${key}</th>`).join('');
    return headers;
  }

  function buildDataRows(data: Array<object>) {
    return data.map(datum => buildDataRow(datum)).join('\n');
  }

  function buildDataRow(data: object) {
    const html = `<tr>
        ${Object.values(data).map(value => `<td>${value}</td>`).join('')}
      </tr>`;
    return html;
  }
}

