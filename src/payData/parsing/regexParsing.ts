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
  const payDataStartMarker = parsingRules.variables.PayDataStartMarker;

  payData.check = extractData({
    ...rules.check,
    content,
    payDataStartMarker,
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
    ...rules.grossEarnings,
    content,
    payDataStartMarker,
  }) as {
    hours: string;
    period: string;
    ytd: string;
    regularRate: string;
  };

  payData.taxes = extractData({
    ...rules.taxes,
    content,
    payDataStartMarker,
  }) as { period: string; ytd: string };

  payData.deductions = extractData({
    ...rules.deductions,
    content,
    payDataStartMarker,
  }) as { period: string; ytd: string };

  payData.deposits = extractData({
    ...rules.deposits,
    content,
    payDataStartMarker,
  }) as { total: string };

  return payData;
}

async function getParsingRules(rules: string | undefined): Promise<any> {
  const parsedRules = await loadParsingRules(rules);

  replaceMarkers({ values: parsedRules.variables, replacements: parsedRules.variables });
  buildRulesRegexPatterns({ values: parsedRules.variables });
  replaceMarkers({ values: parsedRules.rules, replacements: parsedRules.variables });

  return parsedRules;
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
    `Error. Failed to replace regex search value replacement markers. Value provided is not an array or dictionary. value:[${JSON.stringify(values)}]`
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

async function loadParsingRules(rules: string | undefined): Promise<any> {
  if (!isAString(rules) || !rules?.trim()) {
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
        buildMessage: message => `Error reading parsing rules. file:[${rulesFilePath}] reason: ${message}`,
      });
    }
  }

  try {
    const parsedRules = JSON.parse(rulesToParse);
    return parsedRules;
  } catch (error) {
    throw handleError({
      error,
      buildMessage: message => `Error parsing JSON from rules. rules:[${rulesToParse}] reason:${message}`,
    });
  }
}

type RegexValuePattern =
  | string
  | RegexCustomPattern
  | RegexCustomPatternList
  | (string | RegexCustomPattern)[]
  | (string | RegexCustomPattern)[][];

type RegexCustomPattern = {
  join_string?: string | undefined;
  join_type?: RegexElementJoinType | undefined;
  values: RegexValuePattern[];
};

type RegexCustomPatternList = (string | string[] | RegexCustomPattern)[];

type RegexElementJoinType = 'any' | 'none' | 'space' | 'line-element';

type DataFindParameter = string | DataFindSingleParameter | DataFindMultiParameter;

type DataFindSingleParameter = {
  group: string;
  alternateGroup?: string | string[] | undefined;
  pattern?: string | RegexValuePattern | undefined;
  isRequired?: boolean | undefined;
  trim?: boolean | undefined;
  defaultValue?: string | undefined;
};

type DataFindMultiParameter = {
  search_type: 'sequential';
  find: DataFindSingleParameter[];
};

type DataFindDictionary = { [key: string]: DataFindParameter };

const RegexLineElementSeparator = TextLineElementSeparator.replace('|', '\\|');

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
        return '.*?';
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
  payDataStartMarker,
  tableHeader,
  nextTableHeader,
  find_pattern,
  find,
}: {
  content: string;
  payDataStartMarker: string;
  tableHeader: string;
  nextTableHeader: string;
  find_pattern?: string | RegexValuePattern;
  find: DataFindDictionary;
}): object {
  const tableContent = findTableContent({
    content,
    payDataStartMarker,
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
      regex: regexpattern,
    });

    result[key] = single.trim ? value?.trim() : value;
  }

  return result;
}

function findTableContent({
  content,
  payDataStartMarker,
  tableHeader,
  nextTableHeader,
}: {
  content: string;
  payDataStartMarker: string;
  tableHeader: string;
  nextTableHeader: string;
}): string {
  const patternInput: RegexValuePattern = {
    join_type: 'none',
    values: [
      payDataStartMarker,
      '(?<table>',
      [
        ['(?<table_header>', tableHeader, ')'],
        ['(?<desired_values>', '.*', ')'],
      ],
      ')',
      ['(?<next_table_header>', nextTableHeader, ')'],
    ],
  };

  const pattern = buildRegexPattern(patternInput);

  const tableContent = findData({
    content,
    primaryGroup: 'table',
    regex: pattern,
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
  isRequired?: boolean | undefined;
  alternateGroup?: string | string[] | undefined;
  defaultValue?: string | undefined;
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

  throw new Error(`Unable to extract pay data. group:[${primaryGroup}] regex:[${regex}] content:[${content}]`);
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
  alternateGroup?: string | string[] | undefined;
  regex: RegExp;
}): { found: boolean; value?: string | undefined } {
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
