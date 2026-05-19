import { createApp } from "./app.js";
import { buildServices } from "./buildServices.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const config = loadConfig();
const logger = createLogger(config);
const services = buildServices(config, { logger });

createApp(services).listen(config.port, () => {
  logger.info(
    { port: config.port, backend: config.backend, region: config.awsRegion },
    `Mini-Jira API listening (backend=${config.backend})`
  );
});
