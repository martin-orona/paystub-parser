import type { FlatPayData, PayData } from '../../types.ts';

export function generateHtmlTable(payData: PayData[]): string {
  const tableData = prepareTableData(payData);

  const html = `<html>
<head>
</head>
<body>
  <table>
    <thead>
      <tr>
        ${buildHeaders(tableData)}
      </tr>
    </thead>
    <tbody>
      ${buildDataRows(tableData)}
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

    const headers = Object.keys(source)
      .map(key => `<th>${key}</th>`)
      .join('');
    return headers;
  }

  function buildDataRows(data: Array<object>) {
    return data.map(datum => buildDataRow(datum)).join('\n');
  }

  function buildDataRow(data: object) {
    const html = `<tr>
        ${Object.values(data)
          .map(value => `<td>${value}</td>`)
          .join('')}
      </tr>`;
    return html;
  }
}

function prepareTableData(payData: PayData[]): FlatPayData[] {
  const result = payData
    .map(item => getFlatPayData(item))
    .sort((a, b) => {
      const dateA = new Date(a['Check Date']);
      const dateB = new Date(b['Check Date']);
      // sort by date in descending order
      return dateB.getTime() - dateA.getTime();
    });
  return result;
}

function getFlatPayData(payData: PayData): FlatPayData {
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
