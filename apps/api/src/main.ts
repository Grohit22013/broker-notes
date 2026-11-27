import "reflect-metadata";

import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { Logger, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { loadConfig, SESSION_COOKIE } from "./config";

/** Shared app setup — used by main() and by the integration tests, so tests run the real thing. */
export function configureApp(app: INestApplication) {
  const config = loadConfig();
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle("BrokerNotes API")
    .setDescription(
      "REST API for BrokerNotes — compliance-grade file notes for Australian mortgage brokers. " +
        "Sign in via POST /auth/login; the session is an httpOnly cookie.",
    )
    .setVersion("1.0")
    .addCookieAuth(SESSION_COOKIE)
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));
  return app;
}

/**
 * Loads apps/api/.env for local runs; real environment variables always win.
 * (Parses + assigns rather than process.loadEnvFile, which bypasses Jest's per-file process.env.)
 */
export function loadDotEnv(path = ".env") {
  if (!existsSync(path)) return; // production / CI: rely on the real environment
  const vars = parseEnv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadDotEnv();
  const config = loadConfig();
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(config.PORT);
  Logger.log(`API listening on http://localhost:${config.PORT} (docs: /docs)`, "Bootstrap");
}

if (require.main === module) void main();
