class Logger {
  // Set to true to disable logs in production
  static IS_PRODUCTION = false;

  static formatMessage(level, message) {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    return `[${timestamp}] [${level}] ${message}`;
  }

  static info(message, ...args) {
    if (this.IS_PRODUCTION) return;
    console.log(
      `%c${this.formatMessage("INFO", message)}`,
      "color: #3b82f6",
      ...args,
    );
  }

  static success(message, ...args) {
    if (this.IS_PRODUCTION) return;
    console.log(
      `%c${this.formatMessage("SUCCESS", message)}`,
      "color: #22c55e",
      ...args,
    );
  }

  static warn(message, ...args) {
    if (this.IS_PRODUCTION) return;
    console.warn(
      `%c${this.formatMessage("WARN", message)}`,
      "color: #eab308",
      ...args,
    );
  }

  static error(message, ...args) {
    // Errors are usually critical, so we might want to keep them or log them differently.
    // For now, we respect the flag but you might want to log errors to a server instead.
    if (this.IS_PRODUCTION) return;
    console.error(
      `%c${this.formatMessage("ERROR", message)}`,
      "color: #ef4444",
      ...args,
    );
  }

  static debug(message, ...args) {
    if (this.IS_PRODUCTION) return;
    console.debug(
      `%c${this.formatMessage("DEBUG", message)}`,
      "color: #a8a29e",
      ...args,
    );
  }
}

// Attach to window to make it globally accessible
window.Logger = Logger;
