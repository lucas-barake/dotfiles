import { describe, expect, it } from "@effect/vitest"
import { buildProfileEnv, profilePaths, validateProfileName } from "../src/main.ts"

describe("validateProfileName", () => {
  it("accepts normal profile names", () => {
    expect(validateProfileName("personal")).toBeUndefined()
    expect(validateProfileName("work.one_2")).toBeUndefined()
  })

  it("rejects reserved and invalid names", () => {
    expect(validateProfileName("system")).toContain("reserved")
    expect(validateProfileName("-bad")).toContain("hyphen")
    expect(validateProfileName("bad/name")).toContain("letters")
  })
})

describe("profilePaths", () => {
  it("builds profile directories under state/opencode", () => {
    expect(profilePaths("/repo", "personal")).toEqual({
      root: "/repo/state/opencode/personal",
      cache: "/repo/state/opencode/personal/cache",
      config: "/repo/state/opencode/personal/config",
      data: "/repo/state/opencode/personal/data",
      state: "/repo/state/opencode/personal/state"
    })
  })
})

describe("buildProfileEnv", () => {
  it("adds XDG variables for named profiles", () => {
    const env = buildProfileEnv("/repo", "personal")
    expect(env.OPENCODE_PROFILE).toBe("personal")
    expect(env.XDG_CONFIG_HOME).toBe("/repo/state/opencode/personal/config")
  })

  it("clears profile specific variables for system", () => {
    const env = buildProfileEnv("/repo", "system")
    expect(env.OPENCODE_PROFILE).toBeUndefined()
  })
})
