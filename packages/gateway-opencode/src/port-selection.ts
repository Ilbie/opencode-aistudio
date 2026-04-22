import net from "node:net";

const DEFAULT_PORT_START = 4097;
const DEFAULT_PORT_END = 4197;

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}

function configuredPortRange() {
  const explicitPorts = process.env.REPOVERA_OPENCODE_PORTS;
  if (explicitPorts) {
    const ports = explicitPorts
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value < 65536);
    if (ports.length > 0) {
      return ports;
    }
  }

  const start = Number(process.env.REPOVERA_OPENCODE_PORT_START ?? DEFAULT_PORT_START);
  const end = Number(process.env.REPOVERA_OPENCODE_PORT_END ?? DEFAULT_PORT_END);
  if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start && end < 65536) {
    return range(start, end);
  }

  return range(DEFAULT_PORT_START, DEFAULT_PORT_END);
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
