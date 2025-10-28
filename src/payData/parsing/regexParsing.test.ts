import { describe, it, expect, vi } from 'vitest';
import { extractPayData_regex } from './regexParsing';
import { AppParams } from '../../types';

describe('extractPayData_regex()', () => {
  const ParsingRules_Path = './src/regex.rules.json';

  describe('happy path', () => {
    it('extract pay data correctly', async function happy_path() {
      const payStubContent = getPayStubContent('');
      const payData = await extractPayData_regex({
        ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
        parsedPdfData: { text: payStubContent },
      });
      expect(payData).toEqual({
        check: {
          checkDate: PayDataContent.check.default.checkDate,
          checkNumber: PayDataContent.check.default.checkNumber,
          fedTaxIncome: PayDataContent.check.default.fedTaxIncome,
          hoursWorked: PayDataContent.check.default.hoursWorked,
          netPay: PayDataContent.check.default.netPay,
          payPeriodEnd: PayDataContent.check.default.payPeriodEnd,
          payPeriodStart: PayDataContent.check.default.payPeriodStart,
          salary: PayDataContent.check.default.salary,
        },
        grossEarnings: {
          hours: PayDataContent.grossEarnings.default.hours,
          period: PayDataContent.grossEarnings.default.period,
          regularRate: PayDataContent.grossEarnings.default.regularRate,
          ytd: PayDataContent.grossEarnings.default.ytd,
        },
        taxes: {
          period: PayDataContent.taxes.default.period,
          ytd: PayDataContent.taxes.default.ytd,
        },
        deductions: {
          period: PayDataContent.deductions.default.period,
          ytd: PayDataContent.deductions.default.ytd,
        },
        deposits: {
          total: PayDataContent.deposits.default.total,
        },
      });
    });
  });

  describe('edge cases', () => {
    describe('pay data parsing', () => {
      it('no taxes in current period', async function no_taxes_current_period() {
        const payStubContent = getPayStubContent('taxes.no_tax_current_period');
        const payData = await extractPayData_regex({
          ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
          parsedPdfData: { text: payStubContent },
        });
        expect(payData.taxes).toEqual({
          period: PayDataContent.taxes.no_tax_current_period.period,
          ytd: PayDataContent.taxes.no_tax_current_period.ytd,
        });
      });

      it('no deductions in current period', async function no_deductions_current_period() {
        const payStubContent = getPayStubContent('deductions.no_deductions_current_period');

        const payData = await extractPayData_regex({
          ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
          parsedPdfData: { text: payStubContent },
        });
        expect(payData.deductions).toEqual({
          period: PayDataContent.deductions.no_deductions_current_period?.period,
          ytd: PayDataContent.deductions.no_deductions_current_period?.ytd,
        });
      });

      it('match not found 0', async function match_not_found() {
        const payStubContent = getPayStubContent('check.match_not_found');

        const payData = await extractPayData_regex({
          ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
          parsedPdfData: { text: payStubContent },
        });
        expect(payData.deductions).toEqual({
          period: PayDataContent.deductions.no_deductions_current_period?.period,
          ytd: PayDataContent.deductions.no_deductions_current_period?.ytd,
        });
      });

      it('match not found', async function match_not_found() {
        const payStubContent = getPayStubContent('check.match_not_found');

        await expect(
          extractPayData_regex({
            ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
            parsedPdfData: { text: payStubContent },
          })
        ).rejects
          .toThrowError(`Unable to extract pay data. group:[checkNumber] regex:[/Voucher Number.*?(?<checkNumber>\\w+).*?Net Pay.*?(?<netPay>\\-?\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2}){0,1}\\b).*?Total Hours Worked.*?(?<hoursWorked>\\-?\\b\\d+(?:\\.\\d{2,4}\\b)?).*?Fed Taxable Income.*?(?<fedTaxIncome>\\-?\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2}){0,1}\\b).*?Check Date.*?(?<checkDate>\\b\\w+ \\d{1,2}, \\d{4}\\b).*?Period Beginning.*?(?<payPeriodStart>\\b\\w+ \\d{1,2}, \\d{4}\\b).*?Salary \\| \\$?(?<salary>\\-?\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2}){0,1}\\b|).*?Period Ending.*?(?<payPeriodEnd>\\b\\w+ \\d{1,2}, \\d{4}\\b)/ims] content:[Earnings Statement
this should not get matched

]`);
      });

      it('data table not found', async function data_table_not_found() {
        const contentList = [
          PayDataDefaults.documentHeader.text,
          PayDataContent.check.data_table_not_found.text,
          PayDataDefaults.documentFooter.text,
        ];
        const payStubContent = contentList.join('\n');

        await expect(
          extractPayData_regex({
            ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
            parsedPdfData: { text: payStubContent },
          })
        ).rejects
          .toThrowError(`Unable to extract pay data. group:[table] regex:[/(?<doc_header>Non Negotiable - This is not a check - Non Negotiable.*?)(?<table>(?<table_header>Earnings Statement)(?<desired_values>.*))(?<next_table_header>Taxes \\| Amount \\| YTD)/ims] content:[Non Negotiable - This is not a check - Non Negotiable
this table will not be found
this doesn not matter

This is the end of the document.]`);
      });
    });

    describe('regex parsing rules', () => {
      describe('getParsingRules()', () => {
        it('throws error if no rules provided', async function no_rules_provided() {
          const payStubContent = getPayStubContent('');
          await expect(
            extractPayData_regex({
              ...({ payDataRegexParsingRules: ' ' } as AppParams),
              parsedPdfData: { text: payStubContent },
            })
          ).rejects.toThrow('Cannot parse pay data. No parsing rules provided.');
        });

        it('throws error if non-string rules provided', async function no_rules_provided() {
          const payStubContent = getPayStubContent('');
          await expect(
            extractPayData_regex({
              ...({ payDataRegexParsingRules: 7 } as unknown as AppParams),
              parsedPdfData: { text: payStubContent },
            })
          ).rejects.toThrow('Cannot parse pay data. No parsing rules provided.');
        });

        it('throws error if reading the rules file fails', async function file_reading_fails() {
          vi.clearAllMocks();
          const fileModule = await import('../../io/file.io.ts');
          vi.spyOn(fileModule.file, 'read').mockRejectedValue(new Error('read failure'));

          const payStubContent = getPayStubContent('');
          await expect(
            extractPayData_regex({
              ...({ payDataRegexParsingRules: ParsingRules_Path } as AppParams),
              parsedPdfData: { text: payStubContent },
            })
          ).rejects.toThrow(`Error reading parsing rules. file:[${ParsingRules_Path}] reason: read failure`);
        });

        it('throws error if rules are not valid JSON', async function file_reading_fails() {
          const payStubContent = getPayStubContent('');
          await expect(
            extractPayData_regex({
              ...({ payDataRegexParsingRules: 'bad rules' } as AppParams),
              parsedPdfData: { text: payStubContent },
            })
          ).rejects.toThrow(
            `Error parsing JSON from rules. rules:[bad rules] reason:Unexpected token 'b', "bad rules" is not valid JSON`
          );
        });
      });
    });
  });
});

function getPayStubContent(key: string): string {
  let current: { [key: string]: any } = PayDataDefaults;

  if (key) {
    const keyPath = key?.split('.');
    const [prop, ...rest] = keyPath;

    const override = getProperty({ source: PayDataContent, property: key });
    current[prop] = override;
  }

  const contentList = [
    current.documentHeader.text,
    current.check.text,
    current.taxes.text,
    current.grossEarnings.text,
    current.deductions.text,
    current.deposits.text,
    current.timeOff.text,
    current.documentFooter.text,
  ];
  const content = contentList.join('\n');
  return content;
}

function getProperty({ source, property }: { source: object; property: string }): object {
  let current: any = source;
  const keyPath = property.split('.');
  for (const part of keyPath) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      throw new Error(`Key path "${property}" not found in content.`);
    }
  }
  return current;
}

const PayDataContent = {
  documentHeader: { default: { text: `Non Negotiable - This is not a check - Non Negotiable` } },
  documentFooter: { default: { text: `This is the end of the document.` } },
  check: {
    default: {
      checkDate: 'July 7, 7777',
      checkNumber: '7777',
      fedTaxIncome: '7,777.77',
      hoursWorked: '77.77',
      netPay: '7,777.77',
      payPeriodStart: 'July 1, 7777',
      payPeriodEnd: 'July 14, 7777',
      salary: '7,777.77',
      text: `Earnings Statement
Voucher Number | 7777
Net Pay | 7,777.77
Total Hours Worked | 77.77
Employee ID | 777777 | Fed Taxable Income | 7,777.77 | Check Date | July 7, 7777
Location | Home.ID | Fed Filing Status | S+ $777 | Period Beginning | July 1, 7777
Salary | $7,777.77 | State Filing Status | S-0 | Period Ending | July 14, 7777
`,
    },
    match_not_found: {
      checkDate: 'July 7, 7777',
      checkNumber: '7777',
      fedTaxIncome: '7,777.77',
      hoursWorked: '77.77',
      netPay: '7,777.77',
      payPeriodStart: 'July 1, 7777',
      payPeriodEnd: 'July 14, 7777',
      salary: '7,777.77',
      text: `Earnings Statement
this should not get matched
`,
    },
    data_table_not_found: {
      checkDate: 'July 7, 7777',
      checkNumber: '7777',
      fedTaxIncome: '7,777.77',
      hoursWorked: '77.77',
      netPay: '7,777.77',
      payPeriodStart: 'July 1, 7777',
      payPeriodEnd: 'July 14, 7777',
      salary: '7,777.77',
      text: `this table will not be found
this doesn not matter
`,
    },
  },
  grossEarnings: {
    default: {
      hours: '77.77',
      period: '7,777.77',
      regularRate: '77.7777',
      ytd: '77,777.77',
      text: `Earnings | Rate | Hours | Amount | YTD
ER Cost of | 0.00 | 55.55 | 555.55
ER Cost of | 0.00 | 55.55 | 555.55
ER Cost of | 0.00 | 55.55 | 555.55
ER Cost of | 0.00 | 55.55 | 555.55
ER Cost of | 0.00 | 55.55 | 555.55
GROUP TE | 0.00 | 55.55 | 555.55
Holiday Me | 555.55
REGULAR | 77.7777 | 77.77 | 777.77 | 7,777.77
SICK | 77.7777 | 5.55 | 555.55 | 5,555.55
Gross Earnings | 77.77 | 7,777.77 | 77,777.77
`,
    },
  },
  taxes: {
    default: {
      period: '777.77',
      ytd: '7,777.77',
      text: `Taxes | Amount | YTD
CA | 55.55 | 555.55
CASDI-E | 55.55 | 555.55
FITW | 5,555.55 | 5,555.55
MED | 55.55 | 555.55
SS | 55.55 | 555.55
Taxes | 777.77 | 7,777.77
`,
    },
    no_tax_current_period: {
      period: '0.00',
      ytd: '77,777.77',
      text: `Taxes | Amount | YTD
CA | 0.00 | 5,555.55
CASDI-E | 0.00 | 5,555.55
FITW | 0.00 | 5,555.55
MED | 0.00 | 5,555.55
SS | 0.00 | 5,555.55
0.00 | 77,777.77
`,
    },
  },
  deductions: {
    default: {
      period: '77.77',
      ytd: '777.77',
      text: `Deductions | Amount | YTD
DENTAL INS | 5.55 | 55.55
GROUP TERM LIFE CALCULA | 55.55 | 55.55
MEDICAL INS | 55.55 | 555.55
Vol Employee Life | 55.55 | 55.55
Deductions | 77.77 | 777.77
`,
    },
    no_deductions_current_period: {
      period: '',
      ytd: '',
      text: `Deductions | Amount | YTD
No Deductions
`,
    },
  },
  deposits: {
    default: {
      total: '7,777.77',
      text: `Direct Deposits | Type | Account | Amount
BANK NAME | C | ***7777 | 7,777.77
Total Direct Deposits | 7,777.77
`,
    },
  },
  timeOff: {
    default: {
      text: `Time Off
Available
to Use
Plan Year
Used
`,
    },
  },
};

const PayDataDefaults = {
  documentHeader: getProperty({ source: PayDataContent, property: 'documentHeader.default' }),
  documentFooter: getProperty({ source: PayDataContent, property: 'documentFooter.default' }),
  check: getProperty({ source: PayDataContent, property: 'check.default' }),
  grossEarnings: getProperty({ source: PayDataContent, property: 'grossEarnings.default' }),
  taxes: getProperty({ source: PayDataContent, property: 'taxes.default' }),
  deductions: getProperty({ source: PayDataContent, property: 'deductions.default' }),
  deposits: getProperty({ source: PayDataContent, property: 'deposits.default' }),
  timeOff: getProperty({ source: PayDataContent, property: 'timeOff.default' }),
};
