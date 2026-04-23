import net from "node:net";
import { appConfig } from "../../../app-config";

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}

function configuredPortRange() {
  return range(appConfig.opencode.portStart, appConfig.opencode.portEnd);
}

export async function isPortAvailable(port: number, hostname = "127.0.0.1") {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, hostname);
  });
}

export async function selectEphemeralPort(hostname = "127.0.0.1") {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
          return;
        }
        reject(new Error("Unable to resolve ephemeral OpenCode server port"));
      });
    });
    server.listen(0, hostname);
  });
}

export async function selectOpenCodePort(
  ports: readonly number[] = configuredPortRange(),
  hostname = "127.0.0.1"
) {
  for (const port of ports) {
    if (await isPortAvailable(port, hostname)) {
      return port;
    }
  }

  return selectEphemeralPort(hostname);
}
