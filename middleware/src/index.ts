import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { MySqlAppRepository } from "./db/mysqlRepository.js";
import { DevGroundXClient, DevGroundXPartnerClient, DevLlmClient } from "./services/devClients.js";
import { FetchGroundXClient } from "./services/groundxClient.js";
import { FetchGroundXPartnerClient } from "./services/groundxPartnerClient.js";
import { FetchLlmClient } from "./services/llmClient.js";
import { logger } from "./lib/logger.js";

const env = loadEnv();
const useMemoryRepository =
  env.APP_REPOSITORY_MODE === "memory" ||
  (env.APP_REPOSITORY_MODE === "auto" && env.NODE_ENV !== "production" && !env.MYSQL_HOST);
const useDevClients = env.NODE_ENV !== "production" && !env.GROUNDX_PARTNER_API_KEY;

const repository = useMemoryRepository ? new MemoryAppRepository() : new MySqlAppRepository(env);
await repository.createSchema();

const app = createApp({
  env,
  repository,
  partnerClient: useDevClients ? new DevGroundXPartnerClient() : new FetchGroundXPartnerClient(env),
  groundxClient: useDevClients ? new DevGroundXClient() : new FetchGroundXClient(env),
  llmClient: useDevClients ? new DevLlmClient() : new FetchLlmClient(env),
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, repository: useMemoryRepository ? "memory" : "mysql", devClients: useDevClients }, "GroundX middleware scaffold listening");
});
