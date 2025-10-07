import { parseArguments } from './ui/commandLine.ts';
import { extractPayData } from './payData/parsing/parser.ts';
import { identifyPayFiles } from './io/payfiles.ts';
import { writePayData } from './payData/writing/writer.ts';

run();

async function run() {
  try {
    const options = parseArguments();
    const files = await identifyPayFiles(options);
    const payData = await extractPayData({ ...options, files });
    await writePayData({ ...options, payData });
    console.log('Processing completed successfully.');
  } catch (error) {
    console.error('Error during processing:', error);
    throw error;
  }
}
