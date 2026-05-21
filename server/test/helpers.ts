import request from "supertest";
import { createApp } from "../src/app.js";
import { buildLocalServices } from "../src/buildServices.js";
import { pino } from "pino";
import type { AppServices } from "../src/services/index.js";

export type App = ReturnType<typeof createApp>;

const silentLogger = pino({ level: "silent" });

export function buildServices(): AppServices {
  return buildLocalServices({ logger: silentLogger });
}

export function newApp(services: AppServices = buildServices()): App {
  return createApp(services);
}

export async function login(app: App, userId: string): Promise<string> {
  const response = await request(app).post("/api/auth/demo-login").send({ userId }).expect(200);
  return response.body.token as string;
}

export function auth(app: App, token: string) {
  return {
    get: (path: string) => request(app).get(path).set("Authorization", `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set("Authorization", `Bearer ${token}`),
    put: (path: string) => request(app).put(path).set("Authorization", `Bearer ${token}`),
    patch: (path: string) => request(app).patch(path).set("Authorization", `Bearer ${token}`),
    delete: (path: string) => request(app).delete(path).set("Authorization", `Bearer ${token}`)
  };
}
