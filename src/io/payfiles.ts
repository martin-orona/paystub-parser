import type { AppParams } from '../types';
import { directory, path } from './file.io.ts';

export async function identifyPayFiles(options: AppParams): Promise<string[]> {
  if (options.inputFile) {
    return [path.join(options.directory, options.inputFile)];
  }

  if (options.verbose) {
    console.log('Identifying files in directory:', options.directory);
  }

  try {
    const allItems = await directory.getChildren(options.directory, { withFileTypes: true });
    const allFiles = allItems.filter(item => item.isFile());
    const pdfFiles = allFiles.filter(file => path.getExtension(file.name).toLowerCase() === '.pdf');
    const files = pdfFiles.map(file => path.join(options.directory, file.name));
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
