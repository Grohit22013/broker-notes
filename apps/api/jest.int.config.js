/** Integration tests: boot the whole Nest app and hit it over HTTP against a real Postgres. */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/test/**/*.int-spec.ts"],
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 30000,
};
