import { directory, file, path } from '../../io/file.io.ts';
import type { AppParams, FlatPayData, PayData } from '../../types.js';
import { generateHtmlTable } from './generate.html.ts';

type WriteDataParams = AppParams & { payData: PayData[] /* prepareTableData: (data: PayData[]) => FlatPayData[] */ };

export async function writePayData(
  options: WriteDataParams
  // AppParams & {
  //   payData: PayData[];
  //   // prepareTableData: (data: PayData[]) => FlatPayData[];
  // }
) {
  if (options.verbose) {
    console.log(`Writing out pay data`);
  }

  try {
    const outputFile = getOutputFilePath(options);
    await writeData({ ...options, outputFile });
  } catch (error) {
    console.error('Error writing pay data:', error);
    throw error;
  }
}

async function writeData(options: WriteDataParams) {
  if (options.verbose) {
    console.log(`Writing data to output file: ${options.outputFile}`);
  }

  const { outputFile } = options;
  await file.delete(outputFile);
  await directory.create(path.getDirectory(outputFile));
  await writePayDataToFile(options);

  async function writePayDataToFile(options: WriteDataParams) {
    const { outputFile, payData } = options;
    const fileExtension = path.getExtension(outputFile).toLowerCase();

    switch (fileExtension) {
      case '.json':
        await writeJson({ path: outputFile, payData });
        break;
      case '.xlsx':
      case '.xls':
        await writeExcel({ ...options, path: outputFile });
        break;
      default:
        throw new Error(`Unsupported output file format: ${fileExtension}`);
    }
  }
}

async function writeExcel(options: WriteDataParams & { path: string }) {
  const { path, payData } = options;
  const htmlContent = generateHtmlTable(payData);

  try {
    await file.write(path, htmlContent);
  } catch (error) {
    console.error(`Error writing Excel file: ${path}`, error);
    throw error;
  }
}

async function writeJson(options: { path: string; payData: object }) {
  const { path, payData } = options;
  try {
    await file.write(path, JSON.stringify(payData, null, 2));
  } catch (error) {
    console.error(`Error writing data to file: ${path}`, error);
    throw error;
  }
}

function getOutputFilePath(options: { directory: string; outputFile: string | undefined }): string {
  const { outputFile: file, directory: dir } = options;
  if (!file) {
    throw new Error('Output file is not specified.');
  }

  const filePath = path.hasDirectory(file) ? file : path.join(dir, file);
  return filePath;
}
