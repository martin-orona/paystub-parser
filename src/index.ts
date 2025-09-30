import { parseArgs } from 'node:util';
import { readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { pathHasDirectory } from './file.io.ts';
import { writeData } from './writer.ts';
import { extractData, TextLineElementSeparator } from './parser.ts';
import type {
  AppParams,
  FlatPayData,
  PdfParserType,
  PayData,
  PayDataParserType,
  UIParams,
  PdfTextElement,
  PdfTextElementDictionary,
  PdfDataPageDictionary,
} from './types.ts';

run();

async function run() {
  try {
    const options = parseArguments();
    const files = await identifyPayFiles(options);
    const payData = await extractPayData({ ...options, files });
    await writePayData({ ...options, payData, prepareTableData });
    console.log('Processing completed successfully.');
  } catch (error) {
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
    const allItems = await readdir(options.directory, { withFileTypes: true });
    const allFiles = allItems.filter(item => item.isFile());
    const pdfFiles = allFiles.filter(file => extname(file.name).toLowerCase() === '.pdf');
    const files = pdfFiles.map(file => join(options.directory, file.name));
    if (!options.inputFilePattern) {
      return files;
    } else {
      const regex = new RegExp(options.inputFilePattern, options.inputFilePatternFlags);
      const matchedFiles = files.filter(file => regex.test(file));
      return matchedFiles;
    }
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
}

async function extractPayData(options: AppParams & { files: Array<string> }) {
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

  function extractPayData_regex(parsedData: any): PayData {
    const content = parsedData.text;
    const payData = {} as PayData;

    const moneyValue = '\\-?\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2}){0,1}\\b';
    const decimalNumberValue = '\\-?\\b\\d+(?:\\.\\d{2}\\b)?';
    const dateValue = '\\b\\w+ \\d{1,2}, \\d{4}\\b';

    const RegexLineElementSeparator = TextLineElementSeparator.replace('|', '\\|');
    const RegexAnyText = '.*?';
    // const LineBegin_Content =
    //   'Non Negotiable - This is not a check - Non Negotiable.*Non Negotiable - This is not a check - Non Negotiable';
    // const LineBegin_Content = '(?<doc_header>.*Non Negotiable - This is not a check - Non Negotiable.*)';
    const LineBegin_Content = '(?<doc_header>Non Negotiable - This is not a check - Non Negotiable.*)';
    const LineBegin_MetaTable = 'Earnings Statement';
    const LineBegin_EarningsTable = ['Earnings', 'Rate', 'Hours', 'Amount', 'YTD'].join(RegexLineElementSeparator);
    const LineBegin_TaxesTable = ['Taxes', 'Amount', 'YTD'].join(RegexLineElementSeparator);
    const LineBegin_DeductionsTable = ['Deductions', 'Amount', 'YTD'].join(RegexLineElementSeparator);
    const LineBegin_DepositsTable = ['Direct Deposits', 'Type', 'Account', 'Amount'].join(RegexLineElementSeparator);
    const LineBegin_TimeOffTable = `Time Off.*?Available.*?to Use.*?Plan Year.*?Used`;

    type RegexValuePattern =
      | string
      | RegexCustomPattern
      | (string | RegexCustomPattern)[]
      | (string | RegexCustomPattern)[][];
    type RegexCustomPattern = {
      join_string?: string;
      join_type?: RegexElementJoinType;
      values: (string | string[] | RegexCustomPattern)[];
    };
    type RegexElementJoinType = 'any' | 'none' | 'space' | 'line-element';

    function buildRegex({
      tableHeader,
      valuePattern,
      nextTableHeader = undefined,
    }: {
      tableHeader: string;
      valuePattern: RegexValuePattern | any[];
      nextTableHeader?: string;
    }) {
      // // const pattern = Array.isArray(valuePattern) ? { join_type: 'any', values: valuePattern } : valuePattern;
      // const normalized = normalizeRegexPattern(valuePattern, 'any');
      // const value = buildValuePatterns(normalized);
      const value = valuePattern;

      return new RegExp(
        `${LineBegin_Content}.*(?<table>(?<table_header>${tableHeader}).*(?<desired_values>${value})).*(?<next_table_header>${nextTableHeader})`,
        'ism'
      );

      function normalizeRegexPattern(pattern: any, join_type = 'any'): RegexValuePattern {
        if (typeof pattern === 'string') {
          return pattern;
        }

        if (Array.isArray(pattern)) {
          return {
            join_type,
            values: pattern.map(pattern => normalizeRegexPattern(pattern)),
          };
        }

        if (typeof pattern === 'object' && pattern !== null && Array.isArray(pattern.values)) {
          return pattern;
        }

        throw new Error("Invalid valuePattern parameter format, don't know how to handle it.");
      }

      function buildValuePatterns(valuePattern: RegexValuePattern): string {
        if (typeof valuePattern === 'string') {
          return valuePattern;
        }

        // if (Array.isArray(valuePattern) && typeof valuePattern[0] === 'string') {
        //   const builtPattern = buildValuePattern(valuePattern as string[]);
        //   return builtPattern;
        // }

        if (Array.isArray(valuePattern)) {
          const flatPatternElements = valuePattern.map(pattern => buildValuePatterns(pattern));
          const builtPattern = buildValuePattern(flatPatternElements);
          return builtPattern;
        }

        // const builtPatterns: string[] = [];
        // for (const pattern of valuePattern) {
        //   const builtPattern = buildValuePattern(pattern);
        //   builtPatterns.push(builtPattern);
        // }
        const builtPatterns = valuePattern.map(pattern => buildValuePattern(pattern));
        const result = builtPatterns.join(RegexAnyText);
        return result;
      }

      function buildValuePattern(valuePattern: string | string[]): string {
        if (typeof valuePattern === 'string') {
          return valuePattern;
        }

        if (Array.isArray(valuePattern)) {
          const result = valuePattern.join(RegexLineElementSeparator);
          return result;
        }

        throw new Error("Invalid valuePattern parameter format, don't know how to handle it.");
      }
    }

    function buildRegexPattern(options: RegexValuePattern): string | undefined {
      if (typeof options === 'string') {
        return options;
      }

      // const { values, join_string, join_type } = options;
      let values = [],
        join_string = undefined,
        join_type = undefined;
      if (Array.isArray(options)) {
        values = options;
      } else if (typeof options === 'object' && options !== null && Array.isArray(options.values)) {
        ({ values, join_string, join_type } = options);
      }

      const patterns: string[] = [];
      let sourcePatterns: RegexCustomPattern | (string | RegexCustomPattern)[] = [];
      // if (!Array.isArray(pattern)) {
      for (const element of values) {
        // check if element is string or RegexCustomPattern
        if (typeof element === 'string') {
          patterns.push(element);
          continue;
        }

        let source: RegexCustomPattern = { values: [] };
        if (Array.isArray(element)) {
          source.values = element;
        } else if (typeof element === 'object' && element !== null && Array.isArray(element.values)) {
          source = element;
        }

        const builtPatterns = buildRegexPattern(source);
        patterns.push(builtPatterns);

        // const patterns = values.map(item => buildRegexPattern({ values: item }));
      }
      // const patterns = values.map(item => buildRegexPattern({ values: item }));

      const joiner = getJoiner(values, join_string, join_type);
      const joined = patterns.join(joiner);
      return joined;
      // }

      throw new Error("Invalid pattern parameter format, don't know how to handle it.");

      function getJoiner(pattern: string | any[], join_string?: string, join_type?: RegexElementJoinType): string {
        if (join_string != undefined) {
          return join_string;
        }

        switch (join_type) {
          case 'any':
            return RegexAnyText;
          case 'space':
            return ' ';
          case 'none':
            return '';
          case 'line-element':
          default:
            return RegexLineElementSeparator;
        }
      }
    }

    payData.check = extractData2({
      content,
      tableHeader: LineBegin_MetaTable,
      nextTableHeader: LineBegin_TaxesTable,
      find: {
        checkNumber: 'checkNumber',
        checkDate: 'checkDate',
        payPeriodStart: 'payPeriodStart',
        payPeriodEnd: 'payPeriodEnd',
        salary: {
          group: 'salary',
          // pattern: buildRegexPattern(['Salary', `\\$?(?<salary>${moneyValue}|State)`]),
          defaultValue: '',
        },
        netPay: 'netPay',
        fedTaxIncome: 'fedTaxIncome',
        hoursWorked: 'hoursWorked',
      },
      find_pattern:
        //buildRegexPattern(
        {
          join_type: 'any',
          values: [
            ['Voucher Number', '(?<checkNumber>\\w+)'],
            ['Net Pay', `(?<netPay>${moneyValue})`],
            ['Total Hours Worked', `(?<hoursWorked>${decimalNumberValue})`],
            ['Fed Taxable Income', `(?<fedTaxIncome>${moneyValue})`],
            ['Check Date', `(?<checkDate>${dateValue})`],
            ['Period Beginning', `(?<payPeriodStart>${dateValue})`],
            ['Salary', `\\$?(?<salary>${moneyValue}|)`],
            ['Period Ending', `(?<payPeriodEnd>${dateValue})`],
          ],
        },
      //),
    }) as {
      checkNumber: string;
      checkDate: string;
      payPeriodStart: string;
      payPeriodEnd: string;
      salary: string;
      netPay: string;
      fedTaxIncome: string;
      hoursWorked: string;
    };

    payData.grossEarnings = extractData2({
      content,
      tableHeader: LineBegin_EarningsTable,
      nextTableHeader: LineBegin_DeductionsTable,
      find: {
        hours: 'hours',
        period: 'period',
        ytd: 'ytd',
        regularRate: {
          group: 'regular_rate',
          defaultValue: '',
          pattern: ['regular', `(?<regular_rate>${decimalNumberValue})`, ''],
        },
      },
      find_pattern: buildRegexPattern({
        join_type: 'none',
        values: [
          `^(?:Gross Earnings${RegexLineElementSeparator})?`,
          [`(?<hours>${decimalNumberValue})`, `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
        ],
      }),
    }) as { hours: string; period: string; ytd: string; regularRate: string };

    payData.taxes = extractData2({
      content,
      tableHeader: LineBegin_TaxesTable,
      nextTableHeader: LineBegin_EarningsTable,
      find: {
        period: 'period',
        ytd: 'ytd',
      },
      find_pattern: buildRegexPattern({
        join_type: 'none',
        values: [`^(?:Taxes${RegexLineElementSeparator})?`, [`(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`]],
      }),
      // find_pattern: buildRegexPattern(['Taxes', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`]),
      // find_pattern: buildRegexPattern({
      //   join_type: 'any',
      //   values: ['Taxes', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
      // }),
    }) as { period: string; ytd: string };

    payData.deductions = extractData2({
      content,
      tableHeader: LineBegin_DeductionsTable,
      nextTableHeader: LineBegin_DepositsTable,
      find: {
        period: { group: 'period', defaultValue: '' },
        ytd: {
          group: 'ytd',
          alternateGroup: ['ytd_only', 'no_deductions'],
          // ytd: { search_type: 'sequential', find: [{ group: 'ytd', alternateGroup: ['ytd_only', 'no_deductions'] }] },
        },
      },
      find_pattern: {
        join_type: 'none',
        values: [
          '(?:',
          ['Deductions', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
          '|',
          `^(?<ytd_only>${moneyValue})`,
          '|',
          'No Deductions(?<no_deductions>\W|)',
          ')',
        ],
      },
      // find_pattern: buildRegexPattern(['Deductions', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`]),
      // find_pattern: buildRegexPattern(['(?:Deductions)?', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`]),
    }) as { period: string; ytd: string };

    payData.deposits = extractData2({
      content,
      tableHeader: LineBegin_DepositsTable,
      nextTableHeader: LineBegin_TimeOffTable,
      find: {
        total: {
          group: 'deposited',
          alternateGroup: 'no_deposits',
          pattern:
            //buildRegexPattern(
            {
              join_type: 'none',
              values: [
                '(?:',
                'No Direct Deposits',
                '(?<no_deposits>\\W|)',
                '|',
                {
                  join_type: 'none',
                  values: [
                    '^(?:',
                    'Total Direct Deposits',
                    RegexLineElementSeparator,
                    ')?',
                    `(?<deposited>${moneyValue})`,
                  ],
                },
                ')',
              ],
            },
          //)
          trim: true,
        },
      },
    }) as { total: string };

    return payData;

    function extractData({
      content,
      group,
      isRequired = true,
      alternateGroup,
      regex,
    }: {
      content: string;
      group: string;
      isRequired?: boolean;
      alternateGroup?: string;
      regex: RegExp;
    }): string {
      const value = findData({ content, regex, primaryGroup: group, alternateGroup, isRequired });
    }

    type DataFindParameter = string | DataFindSingleParameter | DataFindMultiParameter;
    type DataFindSingleParameter = {
      group: string;
      alternateGroup?: string | string[];
      pattern?: string | RegexValuePattern;
      isRequired?: boolean;
      trim?: boolean;
      defaultValue?: string;
    };
    type DataFindMultiParameter = {
      search_type: 'sequential';
      find: DataFindSingleParameter[];
    };
    type DataFindDictionary = { [key: string]: DataFindParameter };

    function extractData2({
      content,
      tableHeader,
      nextTableHeader,
      find_pattern,
      find,
    }: {
      content: string;
      tableHeader: string;
      nextTableHeader: string;
      find_pattern?: string | RegexValuePattern;
      find: DataFindDictionary;
    }): object {
      const tableContent = findTableContent({
        content,
        tableHeader,
        nextTableHeader,
      });

      if (!tableContent) {
        throw new Error(`Unable to extract pay data. tableHeader:[${tableHeader}]`);
      }

      const result: any = {};
      for (const key in find) {
        let item = find[key];

        if (typeof item === 'string') {
          item = { group: item, pattern: find_pattern ?? '' };
        }

        const regexpattern = buildRegexPattern((item.pattern ?? find_pattern) || '');

        const value = findData({
          content: tableContent,
          primaryGroup: item.group,
          alternateGroup: item.alternateGroup,
          isRequired: item.isRequired ?? true,
          defaultValue: item.defaultValue,
          // TODO: leave this as a string being passed in
          regex: new RegExp(regexpattern || '', 'ism'),
        });
        result[key] = item.trim ? value.trim() : value;
      }

      return result;
    }

    function findTableContent({
      content,
      tableHeader,
      nextTableHeader,
    }: {
      content: string;
      tableHeader: string;
      nextTableHeader: string;
    }): string {
      const tableRegex = buildRegex({
        tableHeader,
        valuePattern: '.*',
        nextTableHeader,
      });
      const tableContent = findData({
        content,
        primaryGroup: 'table',
        regex: tableRegex,
      });

      if (!tableContent) {
        throw new Error(`Unable to extract pay data. tableHeader:[${tableHeader}]`);
      }

      return tableContent;
    }

    function findData({
      content,
      primaryGroup,
      isRequired = true,
      alternateGroup,
      defaultValue,
      regex,
    }: {
      content: string;
      primaryGroup: string;
      isRequired?: boolean;
      alternateGroup?: string | string[];
      defaultValue?: string;
      regex: string | RegExp;
    }): string {
      if (typeof regex === 'string') {
        regex = new RegExp(regex, 'ism');
      }

      const { found, value } = findValue({ content, regex, primaryGroup: primaryGroup, alternateGroup, isRequired });

      if (found && value !== undefined) {
        return value;
      }

      if (defaultValue !== undefined) {
        return defaultValue;
      }

      if (!isRequired) {
        return '';
      }

      throw new Error(`Unable to extract pay data. group:[${primaryGroup}] regex:[${regex}]`);
    }

    function findValue({
      content,
      primaryGroup,
      alternateGroup,
      regex,
    }: {
      content: string;
      primaryGroup: string;
      isRequired?: boolean;
      alternateGroup?: string | string[];
      regex: RegExp;
    }): { found: boolean; value?: string } {
      const match = content.match(regex);
      if (match === null) {
        return { found: false };
      }

      if (matchedGroup(match, primaryGroup)) {
        return { found: true, value: match.groups?.[primaryGroup] };
      } else if (alternateGroup) {
        if (isAString(alternateGroup) && matchedGroup(match, alternateGroup as string)) {
          return { found: true, value: match.groups?.[alternateGroup as string] };
        } else if (Array.isArray(alternateGroup)) {
          for (const group of alternateGroup) {
            if (matchedGroup(match, group)) {
              return { found: true, value: match.groups?.[group] };
            }
          }
        } else {
          throw new Error('Invalid alternateGroup parameter format, must be string or string[].');
        }
      }

      return { found: false };
    }

    function isAString(value: any): boolean {
      return typeof value === 'string' || value instanceof String;
    }

    function matchedGroup(match: RegExpMatchArray, group: string): boolean {
      if (!match) {
        return false;
      }

      if (match.groups?.[group] === undefined) {
        return false;
      }

      return true;
    }
  }

  function extractPayData_regex_1(parsedData: any): PayData {
    const content = parsedData.text;
    const payData = {} as PayData;

    const moneyValue = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?';
    const decimalNumberValue = '\\d+(?:\\.\\d{2})?';
    const dateValue = '\\w+ \\d{1,2}, \\d{4}';

    const RegexLineElementSeparator = TextLineElementSeparator.replace('|', '\\|');
    const RegexAnyText = '.*?';
    // const LineBegin_Content =
    //   'Non Negotiable - This is not a check - Non Negotiable.*Non Negotiable - This is not a check - Non Negotiable';
    // const LineBegin_Content = '(?<doc_header>.*Non Negotiable - This is not a check - Non Negotiable.*)';
    const LineBegin_Content = '(?<doc_header>Non Negotiable - This is not a check - Non Negotiable.*)';
    const LineBegin_MetaTable = 'Earnings Statement';
    const LineBegin_EarningsTable = ['Earnings', 'Rate', 'Hours', 'Amount', 'YTD'].join(RegexLineElementSeparator);
    const LineBegin_TaxesTable = ['Taxes', 'Amount', 'YTD'].join(RegexLineElementSeparator);
    const LineBegin_DeductionsTable = ['Deductions', 'Amount', 'YTD'].join(RegexLineElementSeparator);
    const LineBegin_DepositsTable = ['Direct Deposits', 'Type', 'Account', 'Amount'].join(RegexLineElementSeparator);
    const LineBegin_TimeOffTable = `Time Off.*?Available.*?to Use.*?Plan Year.*?Used`;

    type RegexValuePattern =
      | string
      | RegexCustomPattern
      | (string | RegexCustomPattern)[]
      | (string | RegexCustomPattern)[][];
    type RegexCustomPattern = {
      join_string?: string;
      join_type?: RegexElementJoinType;
      values: (string | string[] | RegexCustomPattern)[];
    };

    function buildRegex({
      tableHeader,
      valuePattern,
      nextTableHeader = undefined,
    }: {
      tableHeader: string;
      valuePattern: RegexValuePattern | any[];
      nextTableHeader?: string;
    }) {
      // // const pattern = Array.isArray(valuePattern) ? { join_type: 'any', values: valuePattern } : valuePattern;
      // const normalized = normalizeRegexPattern(valuePattern, 'any');
      // const value = buildValuePatterns(normalized);
      const value = valuePattern;

      return new RegExp(
        `${LineBegin_Content}.*(?<table>(?<table_header>${tableHeader}).*(?<desired_values>${value})).*(?<next_table_header>${nextTableHeader})`,
        'ism'
      );

      function normalizeRegexPattern(pattern: any, join_type = 'any'): RegexValuePattern {
        if (typeof pattern === 'string') {
          return pattern;
        }

        if (Array.isArray(pattern)) {
          return {
            join_type,
            values: pattern.map(pattern => normalizeRegexPattern(pattern)),
          };
        }

        if (typeof pattern === 'object' && pattern !== null && Array.isArray(pattern.values)) {
          return pattern;
        }

        throw new Error("Invalid valuePattern parameter format, don't know how to handle it.");
      }

      function buildValuePatterns(valuePattern: RegexValuePattern): string {
        if (typeof valuePattern === 'string') {
          return valuePattern;
        }

        // if (Array.isArray(valuePattern) && typeof valuePattern[0] === 'string') {
        //   const builtPattern = buildValuePattern(valuePattern as string[]);
        //   return builtPattern;
        // }

        if (Array.isArray(valuePattern)) {
          const flatPatternElements = valuePattern.map(pattern => buildValuePatterns(pattern));
          const builtPattern = buildValuePattern(flatPatternElements);
          return builtPattern;
        }

        // const builtPatterns: string[] = [];
        // for (const pattern of valuePattern) {
        //   const builtPattern = buildValuePattern(pattern);
        //   builtPatterns.push(builtPattern);
        // }
        const builtPatterns = valuePattern.map(pattern => buildValuePattern(pattern));
        const result = builtPatterns.join(RegexAnyText);
        return result;
      }

      function buildValuePattern(valuePattern: string | string[]): string {
        if (typeof valuePattern === 'string') {
          return valuePattern;
        }

        if (Array.isArray(valuePattern)) {
          const result = valuePattern.join(RegexLineElementSeparator);
          return result;
        }

        throw new Error("Invalid valuePattern parameter format, don't know how to handle it.");
      }
    }

    function buildRegexPattern(options: RegexValuePattern): string {
      if (typeof options === 'string') {
        return options;
      }

      // const { values, join_string, join_type } = options;
      let values = [],
        join_string = undefined,
        join_type = undefined;
      if (Array.isArray(options)) {
        values = options;
      } else if (typeof options === 'object' && options !== null && Array.isArray(options.values)) {
        ({ values, join_string, join_type } = options);
      }

      const patterns: string[] = [];
      let sourcePatterns: RegexCustomPattern | (string | RegexCustomPattern)[] = [];
      // if (!Array.isArray(pattern)) {
      for (const element of values) {
        // check if element is string or RegexCustomPattern
        if (typeof element === 'string') {
          patterns.push(element);
          continue;
        }

        let source: RegexCustomPattern = { values: [] };
        if (Array.isArray(element)) {
          source.values = element;
        } else if (typeof element === 'object' && element !== null && Array.isArray(element.values)) {
          source = element;
        }

        const builtPatterns = buildRegexPattern(source);
        patterns.push(builtPatterns);

        // const patterns = values.map(item => buildRegexPattern({ values: item }));
      }
      // const patterns = values.map(item => buildRegexPattern({ values: item }));

      const joiner = getJoiner(values, join_string, join_type);
      const joined = patterns.join(joiner);
      return joined;
      // }

      throw new Error("Invalid pattern parameter format, don't know how to handle it.");

      function getJoiner(pattern: string | any[], join_string?: string, join_type?: RegexElementJoinType): string {
        if (join_string != undefined) {
          return join_string;
        }

        // if (join_type != undefined) {
        switch (join_type) {
          case 'any':
            return RegexAnyText;
          case 'space':
            return ' ';
          case 'none':
            return '';
          case 'line-element':
          default:
            return RegexLineElementSeparator;
        }
        // }
      }
    }

    let valuePattern = buildRegexPattern({
      join_type: 'any',
      values: [
        ['Voucher Number', '(?<checkNumber>\\w+)'],
        ['Net Pay', `(?<netPay>${moneyValue})`],
        ['Total Hours Worked', `(?<hoursWorked>${decimalNumberValue})`],
        ['Fed Taxable Income', `(?<fedTaxIncome>${moneyValue})`],
        ['Check Date', `(?<checkDate>${dateValue})`],
        ['Period Beginning', `(?<payPeriodStart>${dateValue})`],
        ['Salary', `\\$?(?<salary>${moneyValue}|)`],
        ['Period Ending', `(?<payPeriodEnd>${dateValue})`],
      ],
    });
    let regex = buildRegex({
      valuePattern,
      tableHeader: LineBegin_MetaTable,
      nextTableHeader: LineBegin_TaxesTable,
    });
    payData.check = {
      checkNumber: extractData({
        content,
        group: 'checkNumber',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_MetaTable, valuePattern: `Voucher Number (?<checkNumber>\\w+)` })
      }),
      checkDate: extractData({
        content,
        group: 'checkDate',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_MetaTable, valuePattern: `Check Date (?<checkDate>${dateValue})` })
      }),
      payPeriodStart: extractData({
        content,
        group: 'payPeriodStart',
        regex: regex,
        // buildRegex({
        //   tableBeginning: LineBegin_MetaTable,
        //   valuePattern: `Period Beginning (?<payPeriodStart>${dateValue})`,
        // })
      }),
      payPeriodEnd: extractData({
        content,
        group: 'payPeriodEnd',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_MetaTable, valuePattern: `Period Ending (?<payPeriodEnd>${dateValue})` })
      }),
      salary: extractData({
        content,
        group: 'salary',
        isRequired: false,
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_MetaTable, valuePattern: `Salary \\$(?<salary>${moneyValue})` })
      }),
      netPay: extractData({
        content,
        group: 'netPay',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_MetaTable, valuePattern: `Net Pay (?<netPay>${moneyValue})` })
      }),
      fedTaxIncome: extractData({
        content,
        group: 'fedTaxIncome',
        regex: regex,
        // buildRegex({
        //   tableBeginning: LineBegin_MetaTable,
        //   valuePattern: `Fed Taxable Income (?<fedTaxIncome>${moneyValue})`,
        // })
      }),
      hoursWorked: extractData({
        content,
        group: 'hoursWorked',
        regex: regex,
        // buildRegex({
        //   tableBeginning: LineBegin_MetaTable,
        //   valuePattern: `Total Hours Worked (?<hoursWorked>${decimalNumberValue})`,
        // })
      }),
    };

    valuePattern = buildRegexPattern({
      join_type: 'any',
      values: [
        'Gross Earnings',
        `(?<hours>${decimalNumberValue})`,
        `(?<period>${moneyValue})`,
        `(?<ytd>${moneyValue})`,
      ],
    });
    regex = buildRegex({
      valuePattern,
      tableHeader: LineBegin_EarningsTable,
      nextTableHeader: LineBegin_DeductionsTable,
    });
    payData.grossEarnings = {
      hours: extractData({
        content,
        group: 'hours',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_EarningsTable, valuePattern: grossEarningsRegex })
      }),
      period: extractData({
        content,
        group: 'period',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_EarningsTable, valuePattern: grossEarningsRegex })
      }),
      ytd: extractData({
        content,
        group: 'ytd',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_EarningsTable, valuePattern: grossEarningsRegex })
      }),
    };

    // const taxesRegex = `Taxes (?<period>${moneyValue}) (?<ytd>${moneyValue})`;
    valuePattern = buildRegexPattern({
      join_type: 'any',
      values: ['Taxes', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
    });
    regex = buildRegex({
      valuePattern, //: ['Taxes', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
      tableHeader: LineBegin_TaxesTable,
      nextTableHeader: LineBegin_EarningsTable,
    });
    payData.taxes = {
      period: extractData({
        content,
        group: 'period',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_TaxesTable, valuePattern: taxesRegex })
      }),
      ytd: extractData({
        content,
        group: 'ytd',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_TaxesTable, valuePattern: taxesRegex })
      }),
    };

    // const deductionsRegex = `Deductions (?<period>${moneyValue}) (?<ytd>${moneyValue})`;
    valuePattern = buildRegexPattern({
      join_type: 'any',
      values: ['(?:Deductions)?', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
    });
    regex = buildRegex({
      valuePattern, //: ['Deductions', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
      tableHeader: LineBegin_DeductionsTable,
      nextTableHeader: LineBegin_DepositsTable,
    });
    payData.deductions = {
      period: extractData({
        content,
        group: 'period',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_DeductionsTable, valuePattern: deductionsRegex })
      }),
      ytd: extractData({
        content,
        group: 'ytd',
        regex: regex,
        // buildRegex({ tableBeginning: LineBegin_DeductionsTable, valuePattern: deductionsRegex })
      }),
    };

    valuePattern = buildRegexPattern(
      // {
      // join_type: 'none',
      // values:
      [
        {
          join_type: 'none',
          values: [
            '(?:',
            'No Direct Deposits',
            '(?<no_deposits>\\W|)',
            '|',
            ['Total Direct Deposits', `(?<deposited>${moneyValue})`],
            ')',
          ],
        },
      ]
      // }
    );
    const depositsRegex = buildRegex({
      // valuePattern: [
      //   ['(?:'],
      //   ['No Direct Deposits'],
      //   ['(?<no_deposits>\\W|)'],
      //   ['|'],
      //   ['Total Direct Deposits', `(?<deposited>${moneyValue})`],
      //   [')'],
      // ],
      valuePattern,
      // : [
      //   {
      //     join_string: 'none',
      //     values: [
      //       '(?:',
      //       'No Direct Deposits',
      //       '(?<no_deposits>\\W|)',
      //       '|',
      //       ['Total Direct Deposits', `(?<deposited>${moneyValue})`],
      //       ')',
      //     ],
      //   },
      // ],
      tableHeader: LineBegin_DepositsTable,
      nextTableHeader: LineBegin_TimeOffTable,
    });

    payData.deposits = {
      total: extractData({
        content,
        group: 'deposited',
        alternateGroup: 'no_deposits',
        regex: depositsRegex,
        // buildRegex({
        //   tableBeginning: LineBegin_DepositsTable,
        //   valuePattern: `Total Direct Deposits (?<deposited>${moneyValue})`,
        // })
      }).trim(),
    };

    return payData;

    function extractData({
      content,
      group,
      isRequired = true,
      alternateGroup,
      regex,
    }: {
      content: string;
      group: string;
      isRequired?: boolean;
      alternateGroup?: string;
      regex: RegExp;
    }): string {
      const match = content.match(regex);
      // return match ? match.groups![group] : null;
      if (match && match.groups?.[group]) {
        return match.groups[group];
      } else if (alternateGroup && match && match.groups?.[alternateGroup]) {
        return match.groups[alternateGroup];
      }

      if (!isRequired) {
        return '';
      }

      throw new Error(`Unable to extract pay data. group:[${group}] regex:[${regex}]`);
    }
  }

  function extractPayData_regex_no_spaces(parsedData: any): PayData {
    const content = parsedData.text;
    const payData = {} as PayData;

    const moneyValue = '\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?';
    const decimalNumberValue = '\\d+(?:\\.\\d{2})?';
    const dateValue = '\\w+ \\d{1,2}, \\d{4}';

    payData.check = {
      checkNumber: extractData(content, 'checkNumber', /^Voucher Number(?<checkNumber>\d+)$/m),
      checkDate: extractData(content, 'checkDate', new RegExp(`^.*Check Date(?<checkDate>${dateValue})$`, 'm')),
      payPeriodStart: extractData(
        content,
        'payPeriodStart',
        new RegExp(`^.*Period Beginning(?<payPeriodStart>${dateValue})$`, 'm')
      ),
      payPeriodEnd: extractData(
        content,
        'payPeriodEnd',
        new RegExp(`^.*Period Ending(?<payPeriodEnd>${dateValue})$`, 'm')
      ),
      salary: extractData(content, 'salary', new RegExp(`^Salary\\$(?<salary>${moneyValue}).*$`, 'm')),
      netPay: extractData(content, 'netPay', new RegExp(`^.*Net Pay(?<netPay>${moneyValue}).*$`, 'm')),
      fedTaxIncome: extractData(
        content,
        'fedTaxIncome',
        new RegExp(`^.*Fed Taxable Income(?<fedTaxIncome>${moneyValue}).*$`, 'm')
      ),
      hoursWorked: extractData(
        content,
        'hoursWorked',
        new RegExp(`^.*Total Hours Worked(?<hoursWorked>${decimalNumberValue}).*$`, 'm')
      ),
    };
    payData.grossEarnings = {
      hours: extractData(
        content,
        'hours',
        new RegExp(
          `^.*Gross Earnings(?<hours>${decimalNumberValue})(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`,
          'm'
        )
      ),
      period: extractData(
        content,
        'period',
        new RegExp(
          `^.*Gross Earnings(?<hours>${decimalNumberValue})(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`,
          'm'
        )
      ),
      ytd: extractData(
        content,
        'ytd',
        new RegExp(
          `^.*Gross Earnings(?<hours>${decimalNumberValue})(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`,
          'm'
        )
      ),
    };
    payData.taxes = {
      period: extractData(
        content,
        'period',
        new RegExp(`^.*Taxes(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')
      ),
      ytd: extractData(content, 'ytd', new RegExp(`^.*Taxes(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
    };
    payData.deductions = {
      period: extractData(
        content,
        'period',
        new RegExp(`^.*Deductions(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')
      ),
      ytd: extractData(
        content,
        'ytd',
        new RegExp(`^.*Deductions(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')
      ),
    };
    payData.deposits = {
      total: extractData(
        content,
        'deposited',
        new RegExp(`^.*Total Direct Deposits(?<deposited>${moneyValue}).*$`, 'm')
      ),
    };

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
      }),
      payPeriodStart: extractData(content, {
        when: { text: 'Period Beginning', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
        extract: { position_offset: 1 },
      }),
      payPeriodEnd: extractData(content, {
        when: { text: 'Period Ending', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
        extract: { position_offset: 1 },
      }),
      salary: extractData(content, {
        when: { text: 'Salary', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
        extract: { position_offset: 1 },
      })?.replace(/^\$/, ''),
      netPay: extractData(content, {
        when: { text: 'Net Pay', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
        extract: { position_offset: 1 },
      }),
      fedTaxIncome: extractData(content, {
        when: { text: 'Fed Taxable Income', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
        extract: { position_offset: 1 },
      }),
      hoursWorked: extractData(content, {
        when: { text: 'Total Hours Worked', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
        extract: { position_offset: 1 },
      }),
    };

    payData.grossEarnings = {
      hours: !worked(payData)
        ? '0.00'
        : extractData(content, {
            when: { text: 'Gross Earnings', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
            extract: { position_offset: 1 },
          }),
      period: !worked(payData)
        ? '0.00'
        : extractData(content, {
            when: { text: 'Gross Earnings', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
            extract: { position_offset: 2 },
          }),
      ytd: !worked(payData)
        ? ''
        : extractData(content, {
            when: { text: 'Gross Earnings', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
            extract: { position_offset: 3 },
          }),
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
        : extractData(content, {
            when: { text: 'Taxes', pageNumber: 1, itemNumberAfter: firstTaxesHeader?.itemNumber },
            extract: { position_offset: 1 },
          }),
      ytd: !worked(payData)
        ? ''
        : extractData(content, {
            when: { text: 'Taxes', pageNumber: 1, itemNumberAfter: firstTaxesHeader?.itemNumber },
            extract: { position_offset: 2 },
          }),
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
        : extractData(content, {
            when: { text: 'Total Direct Deposits', pageNumber: 1, itemNumberAfter: page1AnchorElement?.itemNumber },
            extract: { position_offset: 1 },
          }),
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
      if (targetElement.text) {
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
    ): PdfTextElement {
      if (rule.extract?.position_offset) {
        return getElement_byPositionOffset(content, rule, whenElement);
      }
    }

    function getElement_byPositionOffset(
      content: PdfDataPageDictionary,
      rule: any,
      whenElement: PdfTextElement
    ): PdfTextElement {
      const targetPosition = whenElement.itemNumber + rule.extract.position_offset;
      const targetElement = getElement_byPosition(content, whenElement.pageNumber, targetPosition);
      return targetElement;
    }

    function getElement_byPosition(
      content: PdfDataPageDictionary,
      pageNumber: number,
      position: number
    ): PdfTextElement {
      const page = content[pageNumber];
      if (!page) {
        throw new Error(`Unable to find pay data extraction rule element. 'when' page:[${pageNumber}]`);
      }

      const element = page.elements[position];
      return element;
    }

    function getElement_byText(content: PdfDataPageDictionary, rule: any): PdfTextElement | undefined {}

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
}

async function writePayData(
  options: AppParams & {
    payData: PayData[];
    prepareTableData: (data: PayData[]) => FlatPayData[];
  }
) {
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

  function getArgs() {
    const { values: ui_params }: { values: UIParams } = parseArgs({
      options: {
        directory: {
          type: 'string',
          short: 'd',
          default: `${process.cwd()}/input`,
        },
        file: { type: 'string', short: 'f' },
        'file-pattern': { type: 'string', short: 'p', default: '*.pdf' },
        'file-pattern-flags': { type: 'string', default: 'im' },
        'pdf-parser-type': { type: 'string', default: 'pdf-parse' },
        'pay-data-parser-type': { type: 'string', default: 'regex' },
        // output: { type: 'string', short: 'o', default: 'output.json' },
        output: { type: 'string', short: 'o', default: 'output.xls' },
        verbose: { type: 'boolean', short: 'v', default: false },
      },
    });
    return ui_params;
  }

  function validateArgs(args: UIParams) {
    validateValueInList(args, 'pdf-parser-type', ['pdf-parse', 'pdfjs']);
    // TODO: add other validations for multiple choice parameters
    return true;

    function validateValueInList(args: UIParams, key: string, valid: string[]) {
      const value = args[key];
      if (!valid.includes(value)) {
        throw new Error(
          `Invalid value provided for parameter, please provide one of the valid options. parameter:[--${key}] provided:[${value}] valid:[${valid.join(', ')}]`
        );
      }
    }
  }

  function getAppArgs(uiArgs: UIParams): AppParams {
    const appArgs: AppParams = {
      directory: uiArgs.directory,
      inputFile: uiArgs.file || undefined,
      inputFilePattern: uiArgs['file-pattern'] || undefined,
      inputFilePatternFlags: uiArgs['file-pattern-flags'] || undefined,
      pdfParserType: uiArgs['pdf-parser-type'] as PdfParserType,
      payDataParserType: uiArgs['pay-data-parser-type'] as PayDataParserType,
      outputFile: uiArgs.output,
      verbose: uiArgs.verbose,
    };
    return appArgs;
  }
}

async function getOutputFilePath(options: { directory: string; outputFile: string | undefined }): Promise<string> {
  const { outputFile: file, directory: dir } = options;
  if (!file) {
    throw new Error('Output file is not specified.');
  }

  const filePath = pathHasDirectory(file) ? file : join(dir, file);
  return filePath;
}

function prepareTableData(payData: PayData[]): FlatPayData[] {
  const result = payData
    .map(item => getFlatPayData(item))
    .sort((a, b) => {
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
      // 'Gross Earnings Period': payData['grossEarnings']?.['period'] || '',
      // 'Taxes Period': payData['taxes']?.['period'] || '',
      // 'Net Pay': payData['check']?.['netPay'] || '',
      // 'Regular Hourly Rate': payData['grossEarnings']?.['regularRate'] || '',
      Salary: payData['check']?.['salary'] || '',
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
      'Total Direct Deposits': payData['deposits']?.['total'] || '',
      'Regular Hourly Rate': payData['grossEarnings']?.['regularRate'] || '',
    };
    return flatData;
  }
}
