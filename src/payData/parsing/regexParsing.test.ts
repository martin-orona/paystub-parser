import { describe, it, expect } from 'vitest';
import { extractPayData_regex } from './regexParsing';
import { AppParams } from '../../types';

describe('regex parsing pay data', () => {
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
  });

  it('should add numbers correctly', () => {
    expect(1 + 1).toBe(2);
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
