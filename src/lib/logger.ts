type LogFields = Record<string, unknown>;

function write(level: string, message: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    level,
    message,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
