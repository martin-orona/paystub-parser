export function handleError({
  error,
  buildMessage,
  logToConsole = true,
}: {
  error: unknown;
  buildMessage: (message: string) => string;
  logToConsole?: boolean;
}): Error {
  let message: string, err: Error;

  if (error instanceof Error) {
    message = buildMessage(error.message);
    err = error;
  } else {
    message = buildMessage(String(error));
    err = new Error(message);
  }

  if (logToConsole) {
    console.error(message);
  }

  return err;
}
