const PREFIX = '[Library Scores]';

export const log = (...args: unknown[]) => console.log(PREFIX, ...args);
export const logError = (...args: unknown[]) => console.error(PREFIX, ...args);
