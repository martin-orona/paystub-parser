
export type ParserType = 'pdf-parse' | 'pdf-lib';


export type AppParams = {
    directory: string;
    inputFile?: string;
    inputFilePattern?: string;
    inputFilePatternFlags?: string;
    parserType: ParserType;
    outputFile: string;
    verbose: boolean;
}

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
}

export type FlatPayData = {
    'Check Number': string;
    'Check Date': string;
    'Pay Period Start': string;
    'Pay Period End': string;
    'Salary': string;
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
}

