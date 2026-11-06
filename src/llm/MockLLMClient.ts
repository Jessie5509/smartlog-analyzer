import type { LLMClient, LogForAnalysis } from "./LLMClient";

const SUGGESTIONS: Record<string, string> = {
  database: "Revisar el tamaño del pool de conexiones y las consultas lentas.",
  security: "Revisar los intentos de login fallidos y considerar bloquear IPs sospechosas.",
  "external-service": "Agregar reintentos y un circuit breaker para el proveedor externo.",
  other: "Revisar manualmente los mensajes sin categoría.",
};

function categorize(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("db") || text.includes("pool") || text.includes("query")) return "database";
  if (text.includes("login") || text.includes("token") || text.includes("account")) return "security";
  if (text.includes("api") || text.includes("carrier") || text.includes("503")) return "external-service";
  return "other";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockLLMClient implements LLMClient {
  readonly name = "mock";

  constructor(private delayMs = 300) {}

  async analyze(logs: LogForAnalysis[]) {
    await sleep(this.delayMs);

    const errorCount = logs.filter((log) => log.level === "ERROR").length;
    const warnCount = logs.filter((log) => log.level === "WARN").length;
    const problems = logs.filter((log) => log.level === "ERROR" || log.level === "WARN");

    const groups: Record<string, { count: number; services: Set<string> }> = {};
    for (const log of problems) {
      const category = categorize(log.message);
      groups[category] ??= { count: 0, services: new Set() };
      groups[category].count += 1;
      groups[category].services.add(log.service);
    }

    const categories = Object.entries(groups).map(([name, group]) => ({
      name,
      description: `${group.count} problemas detectados en: ${[...group.services].join(", ")}`,
    }));

    const suggestions = Object.keys(groups).map((name) => SUGGESTIONS[name]);

    const summary =
      problems.length === 0
        ? `Se analizaron ${logs.length} logs y no se detectaron problemas.`
        : `Se analizaron ${logs.length} logs: ${errorCount} errores y ${warnCount} advertencias.`;

    return { summary, categories, suggestions };
  }
}