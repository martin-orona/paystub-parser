import { dirname, extname } from 'path/posix';
import { createDirectoryIfNotExists, deleteFileIfExists, writeFile } from './file.io.ts';

export function generateHtmlTable(payData: object[]) {
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

export async function writeData(options: { directory: string; output: string; verbose: boolean; payData: object; prepareTableData: (data: object) => object[]; }) {
    if (options.verbose) {
        console.log(`Writing data to output file: ${options.output}`);
    }


    const { output: outputFile } = options;
    await deleteFileIfExists(outputFile);
    await createDirectoryIfNotExists(dirname(outputFile));
    await writePayDataToFile(options);

    async function writePayDataToFile(options: { output: string; verbose: boolean; payData: object; prepareTableData: (data: object) => object[]; }) {
        const { output: outputFile, payData } = options;
        const fileExtension = extname(outputFile).toLowerCase();

        switch (fileExtension) {
            case '.json':
                await writeJson({ path: outputFile, payData });
                break;
            case '.xlsx':
            case '.xls':
                await writeExcel({ ...options, path: outputFile, payData });
                break;
            default:
                throw new Error(`Unsupported output file format: ${fileExtension}`);
        }
    }

}

export async function writeExcel(options: { path: string; payData: object; prepareTableData: (data: object) => object[]; }) {
    const { path, payData } = options;
    const tableData = options.prepareTableData(payData);
    const htmlContent = generateHtmlTable(tableData);

    try {
        await writeFile(path, htmlContent);
    } catch (error) {
        console.error(`Error writing Excel file: ${path}`, error);
        throw error;
    }
}

export async function writeJson(options: { path: string; payData: object; }) {
    const { path, payData } = options;
    try {
        await writeFile(path, JSON.stringify(payData, null, 2));
    } catch (error) {
        console.error(`Error writing data to file: ${path}`, error);
        throw error;
    }
}
