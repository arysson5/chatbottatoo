export async function evolutionFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const hint =
      process.env.EVOLUTION_BASE_URL?.includes("localhost") &&
      process.env.NODE_ENV !== "production"
        ? " Se o Next.js roda no Docker, use EVOLUTION_BASE_URL=http://evolution-api:8080 (compose) ou http://host.docker.internal:8080."
        : "";
    throw new Error(
      `Não foi possível contactar a Evolution API em ${url}.${hint} (${error instanceof Error ? error.message : "fetch failed"})`,
    );
  }
}
