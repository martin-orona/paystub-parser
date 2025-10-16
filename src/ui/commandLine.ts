import { parseArgs } from 'node:util';
import type {
  AppParams,
  PdfParserType,
  PayDataParserType,
  UIParams,
  UIParamKeys,
  UIParamValueTypes,
} from '../types.ts';

export function parseArguments(): AppParams {
  const uiArgs = getArgs();
  validateArgs(uiArgs);
  const appArgs = getAppArgs(uiArgs);
  return appArgs;
}

function getArgs(): UIParams {
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
      'pay-data-regex-parsing-rules': { type: 'string', default: '' },
      output: { type: 'string', short: 'o', default: 'output.xls' },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
  });
  return ui_params;
}

function validateArgs(args: UIParams) {
  validateValueInList(args, 'pdf-parser-type', ['pdf-parse', 'pdfjs']);
  validateValueInList(args, 'pay-data-parser-type', ['regex']);
  validateRegexParserRules(args);
  return true;

  function validateRegexParserRules(args: UIParams): boolean {
    if (args['pay-data-parser-type'] === 'regex') {
      if (
        typeof args['pay-data-regex-parsing-rules'] !== 'string' ||
        args['pay-data-regex-parsing-rules'].trim().length === 0
      ) {
        throw new Error(
          `When using --pay-data-parser-type=regex, you must provide a valid patterns or a path to a file that contains valid patterns for the regex parsing rules in parameter --pay-data-regex-parsing-rules.`
        );
      }
    }
    return true;
  }

  function validateValueInList(args: UIParams, key: UIParamKeys, valid: readonly UIParamValueTypes[]) {
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
    payDataRegexParsingRules: uiArgs['pay-data-regex-parsing-rules'] || undefined,
    outputFile: uiArgs.output,
    verbose: uiArgs.verbose,
  };
  return appArgs;
}
