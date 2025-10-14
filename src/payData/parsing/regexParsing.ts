import { file } from '../../io/file.io.ts';
import { isStringDictionary, type AppParams, type PayData, type StringDictionary } from '../../types.ts';
import { handleError } from '../../utilities/errors.ts';
import { isAString } from '../../utilities/utilities.ts';
import { TextLineElementSeparator } from './constants.ts';

export async function extractPayData_regex(options: AppParams & { parsedPdfData: any }): Promise<PayData> {
  return await extractPayData_regex_parsed_rules(options);
}

async function extractPayData_regex_parsed_rules(options: AppParams & { parsedPdfData: any }): Promise<PayData> {
  const content = options.parsedPdfData.text;
  const payData = {} as PayData;

  const parsingRules = await getParsingRules(options.payDataRegexParsingRules);
  const rules = parsingRules.rules;

  payData.check = extractData({ ...rules.check, content }) as {
    checkNumber: string;
    checkDate: string;
    payPeriodStart: string;
    payPeriodEnd: string;
    salary: string;
    netPay: string;
    fedTaxIncome: string;
    hoursWorked: string;
  };

  payData.grossEarnings = extractData({ ...rules.grossEarnings, content }) as {
    hours: string;
    period: string;
    ytd: string;
    regularRate: string;
  };

  payData.taxes = extractData({ ...rules.taxes, content }) as { period: string; ytd: string };

  payData.deductions = extractData({ ...rules.deductions, content }) as { period: string; ytd: string };

  payData.deposits = extractData({ ...rules.deposits, content }) as { total: string };

  return payData;
}

async function getParsingRules(rules: string | undefined): Promise<any> {
  const parsedRules = await loadParsingRules(rules);

  // do value replacements
  replaceMarkers({ values: parsedRules.variables, replacements: parsedRules.variables });
  buildRulesRegexPatterns({ values: parsedRules.variables });
  replaceMarkers({ values: parsedRules.rules, replacements: parsedRules.variables });

  return parsedRules;
}

function buildRulesRegexes({
  values,
  replacements,
}: {
  values: string[] | StringDictionary;
  replacements: { [key: string]: string };
}): any {
  // test whether values is an object
  // test whether values has properties tableHeader, nextTableHeader (optional), and valuePattern
  if (typeof values === typeof Object && 'tableHeader' in values && 'valuePattern' in values) {
    // buildRulesRegexPatterns({ values, replacements });
    // buildRulesRegex();
  }
  //   function buildRegex({
  //   tableHeader,
  //   valuePattern,
  //   nextTableHeader = undefined,
  // }: {
  //   tableHeader: string;
  //   valuePattern: RegexValuePattern | any[];
  //   nextTableHeader?: string;
  // }) {
  //   const pattern = buildRegexPattern({
}

function buildRulesRegexPatterns({ values }: { values: StringDictionary }): any {
  for (const [key, value] of Object.entries(values)) {
    if (isAString(value)) {
      continue;
    }

    values[key] = buildRegexPattern(value);
  }

  return values;
}

function replaceMarkers({
  values,
  replacements,
}: {
  values: string[] | StringDictionary;
  replacements: { [key: string]: string };
}): any {
  if (Array.isArray(values)) {
    return replaceMarkersInArray({ values, replacements });
  }

  if (isStringDictionary(values)) {
    return replaceMarkersInDictionary({ values, replacements });
  }

  throw new Error(
    `Error. Failed to replace regex search value replacement markers. Value provided is not a string, array, or dictionary. value:[${JSON.stringify(values)}]`
  );
}

function replaceMarkersInArray({
  values,
  replacements,
}: {
  values: string[];
  replacements: { [key: string]: string };
}): string[] {
  for (let i = 0; i < values.length; i++) {
    const item = values[i];
    if (isAString(item)) {
      values[i] = getValueWithMarkersReplaced({ value: item as string, replacements });
    } else {
      replaceMarkers({ values: item as unknown as StringDictionary, replacements });
    }
  }

  return values;
}

function replaceMarkersInDictionary({
  values,
  replacements,
}: {
  values: StringDictionary;
  replacements: { [key: string]: string };
}): StringDictionary {
  for (const [key, value] of Object.entries(values)) {
    if (isAString(value)) {
      values[key] = getValueWithMarkersReplaced({ value: value as string, replacements });
    } else if (Array.isArray(value) || isStringDictionary(value)) {
      replaceMarkers({ values: value, replacements });
    }
  }
  return values;
}

function getValueWithMarkersReplaced({
  value,
  replacements,
}: {
  value: string;
  replacements: { [key: string]: string };
}): string {
  const regex = /(?<marker>{{(?<token>\w+)}})/gims;
  const matches = Array.from(value.matchAll(regex));
  if (matches?.length > 0) {
    let result = value;
    for (const match of matches) {
      if (groupWasMatched({ group: 'token', match })) {
        const token = match?.groups?.token as string;
        if (replacements[token]) {
          result = result.replace(match?.groups?.marker as string, replacements[token]);
        }
      }
    }
    return result;
  } else {
    return value;
  }
}

function hasAReplacementMarker(value: string): boolean {
  return /\{\{(\w+)\}\}/.test(value);
}

async function loadParsingRules(rules: string | undefined): Promise<any> {
  if (!rules?.trim() || !isAString(rules)) {
    throw new Error('Cannot parse pay data. No parsing rules provided.');
  }

  let rulesToParse = rules;

  const rulesFilePath = rules;
  if (await file.exists(rulesFilePath)) {
    try {
      const ruleFileContent = (await file.read(rulesFilePath)) as unknown;
      rulesToParse = ruleFileContent?.toString() as string;
    } catch (error) {
      throw handleError({
        error,
        buildMessage: message => `Error reading parsing rules. file:[${rulesFilePath}] reason:${message}`,
      });
    }
  }

  try {
    const parsedRules = JSON.parse(rulesToParse);
    return parsedRules;
  } catch (error) {
    throw handleError({
      error,
      buildMessage: message => `Error parsing JSON from rules. file:[${rulesFilePath}] reason:${message}`,
    });
  }
}

function extractPayData_regex_hard_coded_rules(options: AppParams & { parsedData: any }): PayData {
  const content = options.parsedData.text;
  const payData = {} as PayData;

  payData.check = extractData({
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

  payData.grossEarnings = extractData({
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
        pattern: {
          join_type: 'none',
          values: [
            'regular',
            RegexLineElementSeparator,
            '(?<regular_rate>',
            decimalNumberValue,
            ')',
            RegexLineElementSeparator,
            // '',
          ],
        },
      },
    },
    find_pattern: buildRegexPattern({
      join_type: 'none',
      values: [
        ['^(?:', 'Gross Earnings', RegexLineElementSeparator, ')?'],
        [
          ['(?<hours>', decimalNumberValue, ')'],
          RegexLineElementSeparator,
          ['(?<period>', moneyValue, ')'],
          RegexLineElementSeparator,
          ['(?<ytd>', moneyValue, ')'],
        ],
      ],
    }),
  }) as { hours: string; period: string; ytd: string; regularRate: string };

  payData.taxes = extractData({
    content,
    tableHeader: LineBegin_TaxesTable,
    nextTableHeader: LineBegin_EarningsTable,
    find: {
      period: 'period',
      ytd: 'ytd',
    },
    find_pattern: buildRegexPattern({
      join_type: 'none',
      values: [
        '^',
        ['(?:', 'Taxes', RegexLineElementSeparator, ')?'],
        [['(?<period>', moneyValue, ')'], RegexLineElementSeparator, ['(?<ytd>', moneyValue, ')']],
      ],
    }),
    // find_pattern: buildRegexPattern(['Taxes', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`]),
    // find_pattern: buildRegexPattern({
    //   join_type: 'any',
    //   values: ['Taxes', `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
    // }),
  }) as { period: string; ytd: string };

  payData.deductions = extractData({
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
        [
          'Deductions',
          RegexLineElementSeparator,
          `(?<period>${moneyValue})`,
          RegexLineElementSeparator,
          `(?<ytd>${moneyValue})`,
        ],
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

  payData.deposits = extractData({
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
              // {
              //   join_type: 'none',
              //   values:
              ['^(?:', 'Total Direct Deposits', RegexLineElementSeparator, ')?', `(?<deposited>${moneyValue})`],
              // },
              ')',
            ],
          },
        //)
        trim: true,
      },
    },
  }) as { total: string };

  return payData;
}

type RegexValuePattern =
  | string
  | RegexCustomPattern
  | RegexCustomPatternList
  | (string | RegexCustomPattern)[]
  | (string | RegexCustomPattern)[][];
type RegexCustomPattern = {
  join_string?: string;
  join_type?: RegexElementJoinType;
  values: RegexValuePattern[];
};
type RegexCustomPatternList = (string | string[] | RegexCustomPattern)[];
type RegexElementJoinType = 'any' | 'none' | 'space' | 'line-element';

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

const moneyValue = '\\-?\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2}){0,1}\\b';
const decimalNumberValue = '\\-?\\b\\d+(?:\\.\\d{2,4}\\b)?';
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

function buildRegex({
  tableHeader,
  valuePattern,
  nextTableHeader = undefined,
}: {
  tableHeader: string;
  valuePattern: RegexValuePattern | any[];
  nextTableHeader?: string;
}) {
  const pattern = buildRegexPattern({
    join_type: 'none',
    values: [
      LineBegin_Content,
      '(?<table>',
      [
        ['(?<table_header>', tableHeader, ')'],
        ['(?<desired_values>', valuePattern, ')'],
      ],
      ')',
      ['(?<next_table_header>', nextTableHeader, ')'],
    ] as (string | RegexCustomPattern)[],
  }) as string;

  return new RegExp(pattern, 'ism');

  function buildValuePatterns(valuePattern: RegexValuePattern): string {
    if (typeof valuePattern === 'string') {
      return valuePattern;
    }

    if (Array.isArray(valuePattern)) {
      const flatPatternElements = valuePattern.map(pattern => buildValuePatterns(pattern));
      const builtPattern = buildValuePattern(flatPatternElements);
      return builtPattern;
    }

    if (isRegexCustomPattern(valuePattern)) {
      const flatPatternElements = buildValuePatterns(valuePattern.values as RegexCustomPatternList);
      return flatPatternElements;
    }

    throw new Error(`Invalid valuePattern parameter format, don't know how to handle it. pattern:[${valuePattern}]`);
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

function buildRegexPattern(options: RegexValuePattern | RegexValuePattern[]): string {
  if (typeof options === 'string') {
    return options;
  }

  let values: RegexValuePattern[] = [],
    join_string = undefined,
    join_type = undefined;
  if (Array.isArray(options)) {
    values = options as RegexValuePattern[];
    join_string = getJoiner(values, join_string, join_type);
  } else if (isRegexCustomPattern(options)) {
    ({ values, join_string, join_type } = options as RegexCustomPattern);
  }

  const patterns: string[] = [];
  let sourcePatterns: RegexCustomPattern | (string | RegexCustomPattern)[] = [];

  for (const element of values) {
    if (typeof element === 'string') {
      patterns.push(element);
      continue;
    }

    let source: RegexCustomPattern = { join_string, join_type, values: [] };

    if (Array.isArray(element)) {
      source.values = element;
    } else if (isRegexCustomPattern(element)) {
      source = element;
    }

    const builtPatterns = buildRegexPattern(source);

    patterns.push(builtPatterns);
  }

  const joiner = getJoiner(values, join_string, join_type);
  const joined = patterns.join(joiner);
  return joined;

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

function extractData({
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
  let single: DataFindSingleParameter;

  for (const key in find) {
    let item = find[key] as DataFindParameter;

    // TODO: deal with DataFindMultiParameter search

    if (typeof item === 'string') {
      single = { group: item, pattern: find_pattern ?? '' };
    } else if (isDataFindSingleParameter(item)) {
      single = item as DataFindSingleParameter;
    } else if (isDataFindMultiParameter(item)) {
      // TODO: handle DataFindMultiParameter
      throw new Error('DataFindMultiParameter is not yet supported in extractData function.');
    } else {
      throw new Error('Invalid find parameter format, must be string or DataFindSingleParameter.');
    }

    const regexpattern = buildRegexPattern((single.pattern ?? find_pattern) || '');

    const value = findData({
      content: tableContent,
      primaryGroup: single.group,
      alternateGroup: single.alternateGroup,
      isRequired: single.isRequired ?? true,
      defaultValue: single.defaultValue,
      // TODO: leave this as a string being passed in
      regex: new RegExp(regexpattern || '', 'ism'),
    });

    result[key] = single.trim ? value?.trim() : value;
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

  const { found, value } = findValue({ content, regex, primaryGroup, alternateGroup, isRequired });

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

  if (groupWasMatched({ group: primaryGroup, match })) {
    return { found: true, value: match.groups?.[primaryGroup] };
  } else if (alternateGroup) {
    if (isAString(alternateGroup) && groupWasMatched({ group: alternateGroup as string, match })) {
      return { found: true, value: match.groups?.[alternateGroup as string] };
    } else if (Array.isArray(alternateGroup)) {
      for (const group of alternateGroup) {
        if (groupWasMatched({ group, match })) {
          return { found: true, value: match.groups?.[group] };
        }
      }
    } else {
      throw new Error('Invalid alternateGroup parameter format, must be string or string[].');
    }
  }

  return { found: false };
}

function groupWasMatched({ group, match }: { match: RegExpMatchArray; group: string }): boolean {
  if (!match) {
    return false;
  }

  if (match.groups?.[group] === undefined) {
    return false;
  }

  return true;
}

function isDataFindSingleParameter(candidate: any): candidate is DataFindSingleParameter {
  return (
    typeof candidate === 'object' && candidate !== null && 'group' in candidate && typeof candidate.group === 'string'
  );
}
function isDataFindMultiParameter(candidate: any): candidate is DataFindMultiParameter {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'search_type' in candidate &&
    candidate.search_type === 'sequential' &&
    'find' in candidate &&
    Array.isArray(candidate.find)
  );
}

function isRegexCustomPattern(candidate: any): candidate is RegexCustomPattern {
  return typeof candidate === 'object' && candidate !== null && Array.isArray(candidate.values);
}

/*
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
    values: ['Gross Earnings', `(?<hours>${decimalNumberValue})`, `(?<period>${moneyValue})`, `(?<ytd>${moneyValue})`],
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
    period: extractData(content, 'period', new RegExp(`^.*Taxes(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
    ytd: extractData(content, 'ytd', new RegExp(`^.*Taxes(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
  };
  payData.deductions = {
    period: extractData(
      content,
      'period',
      new RegExp(`^.*Deductions(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')
    ),
    ytd: extractData(content, 'ytd', new RegExp(`^.*Deductions(?<period>${moneyValue})(?<ytd>${moneyValue}).*$`, 'm')),
  };
  payData.deposits = {
    total: extractData(content, 'deposited', new RegExp(`^.*Total Direct Deposits(?<deposited>${moneyValue}).*$`, 'm')),
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
*/
