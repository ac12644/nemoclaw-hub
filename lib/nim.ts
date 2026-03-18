import { spawnSync } from "child_process";
import { run, runCapture } from "./runner.js";
import nimImages from "./nim-images.json" with { type: "json" };

export interface GpuInfo {
  type: "nvidia" | "apple";
  name?: string;
  count: number;
  totalMemoryMB: number;
  perGpuMB: number;
  nimCapable: boolean;
  spark?: boolean;
  cores?: number | null;
}

export interface NimModel {
  name: string;
  image: string;
  minGpuMemoryMB: number;
}

export interface NimStatus {
  running: boolean;
  healthy?: boolean;
  container: string;
  state?: string;
}

export function containerName(sandboxName: string): string {
  return `nemoclaw-nim-${sandboxName}`;
}

export function getImageForModel(modelName: string): string | null {
  const entry = nimImages.models.find((m) => m.name === modelName);
  return entry ? entry.image : null;
}

export function listModels(): NimModel[] {
  return nimImages.models.map((m) => ({
    name: m.name,
    image: m.image,
    minGpuMemoryMB: m.minGpuMemoryMB,
  }));
}

export function detectGpu(): GpuInfo | null {
  // Try NVIDIA first
  try {
    const output = runCapture(
      "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits",
      { ignoreError: true }
    );
    if (output) {
      const lines = output.split("\n").filter((l) => l.trim());
      const perGpuMB = lines.map((l) => parseInt(l.trim(), 10)).filter((n) => !isNaN(n));
      if (perGpuMB.length > 0) {
        return {
          type: "nvidia",
          count: perGpuMB.length,
          totalMemoryMB: perGpuMB.reduce((a, b) => a + b, 0),
          perGpuMB: perGpuMB[0],
          nimCapable: true,
        };
      }
    }
  } catch { /* ignore */ }

  // DGX Spark (GB10) fallback
  try {
    const nameOutput = runCapture(
      "nvidia-smi --query-gpu=name --format=csv,noheader,nounits",
      { ignoreError: true }
    );
    if (nameOutput && nameOutput.includes("GB10")) {
      let totalMemoryMB = 0;
      try {
        const memLine = runCapture("free -m | awk '/Mem:/ {print $2}'", { ignoreError: true });
        if (memLine) totalMemoryMB = parseInt(memLine.trim(), 10) || 0;
      } catch { /* ignore */ }
      return {
        type: "nvidia", count: 1, totalMemoryMB, perGpuMB: totalMemoryMB,
        nimCapable: true, spark: true,
      };
    }
  } catch { /* ignore */ }

  // macOS: Apple Silicon or discrete GPU
  if (process.platform === "darwin") {
    try {
      const spOutput = runCapture("system_profiler SPDisplaysDataType 2>/dev/null", { ignoreError: true });
      if (spOutput) {
        const chipMatch = spOutput.match(/Chipset Model:\s*(.+)/);
        const vramMatch = spOutput.match(/VRAM.*?:\s*(\d+)\s*(MB|GB)/i);
        const coresMatch = spOutput.match(/Total Number of Cores:\s*(\d+)/);

        if (chipMatch) {
          let memoryMB = 0;
          if (vramMatch) {
            memoryMB = parseInt(vramMatch[1], 10);
            if (vramMatch[2].toUpperCase() === "GB") memoryMB *= 1024;
          } else {
            try {
              const memBytes = runCapture("sysctl -n hw.memsize", { ignoreError: true });
              if (memBytes) memoryMB = Math.floor(parseInt(memBytes, 10) / 1024 / 1024);
            } catch { /* ignore */ }
          }

          return {
            type: "apple",
            name: chipMatch[1].trim(),
            count: 1,
            cores: coresMatch ? parseInt(coresMatch[1], 10) : null,
            totalMemoryMB: memoryMB,
            perGpuMB: memoryMB,
            nimCapable: false,
          };
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

export function pullNimImage(model: string): string {
  const image = getImageForModel(model);
  if (!image) {
    console.error(`  Unknown model: ${model}`);
    process.exit(1);
  }
  console.log(`  Pulling NIM image: ${image}`);
  run(`docker pull ${image}`);
  return image;
}

export function startNimContainer(sandboxName: string, model: string, port = 8000): string {
  const name = containerName(sandboxName);
  const image = getImageForModel(model);
  if (!image) {
    console.error(`  Unknown model: ${model}`);
    process.exit(1);
  }
  run(`docker rm -f ${name} 2>/dev/null || true`, { ignoreError: true });
  console.log(`  Starting NIM container: ${name}`);
  run(`docker run -d --gpus all -p ${port}:8000 --name ${name} --shm-size 16g ${image}`);
  return name;
}

export function waitForNimHealth(port = 8000, timeout = 300): boolean {
  const start = Date.now();
  console.log(`  Waiting for NIM health on port ${port} (timeout: ${timeout}s)...`);

  while ((Date.now() - start) / 1000 < timeout) {
    try {
      const result = runCapture(`curl -sf http://localhost:${port}/v1/models`, { ignoreError: true });
      if (result) {
        console.log("  NIM is healthy.");
        return true;
      }
    } catch { /* ignore */ }
    spawnSync("sleep", ["5"]);
  }
  console.error(`  NIM did not become healthy within ${timeout}s.`);
  return false;
}

export function stopNimContainer(sandboxName: string): void {
  const name = containerName(sandboxName);
  console.log(`  Stopping NIM container: ${name}`);
  run(`docker stop ${name} 2>/dev/null || true`, { ignoreError: true });
  run(`docker rm ${name} 2>/dev/null || true`, { ignoreError: true });
}

export function nimStatus(sandboxName: string): NimStatus {
  const name = containerName(sandboxName);
  try {
    const state = runCapture(
      `docker inspect --format '{{.State.Status}}' ${name} 2>/dev/null`,
      { ignoreError: true }
    );
    if (!state) return { running: false, container: name };

    let healthy = false;
    if (state === "running") {
      const health = runCapture(`curl -sf http://localhost:8000/v1/models 2>/dev/null`, { ignoreError: true });
      healthy = !!health;
    }
    return { running: state === "running", healthy, container: name, state };
  } catch {
    return { running: false, container: name };
  }
}
