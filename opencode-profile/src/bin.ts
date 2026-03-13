import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as Effect from "effect/Effect"
import { run } from "./main.ts"

run.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain)
