export function createGracefulChildStopper(
  child,
  { timeoutMs = 15_000, shutdownMessage = { type: "shutdown" } } = {},
) {
  let stoppingPromise;

  return function stop() {
    if (stoppingPromise) {
      return stoppingPromise;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve();
    }

    stoppingPromise = new Promise((resolve, reject) => {
      const onExit = () => {
        globalThis.clearTimeout(timeout);
        resolve();
      };
      const timeout = globalThis.setTimeout(() => {
        child.removeListener("exit", onExit);
        reject(new Error(`Timed out waiting ${timeoutMs}ms for the child process to stop`));
      }, timeoutMs);

      child.once("exit", onExit);

      if (child.connected && typeof child.send === "function") {
        child.send(shutdownMessage);
        return;
      }

      child.kill("SIGTERM");
    });

    return stoppingPromise;
  };
}
