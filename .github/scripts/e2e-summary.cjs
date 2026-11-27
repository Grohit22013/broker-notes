// Usage: node e2e-summary.cjs <playwright-json-report>
const fs = require("fs");
const file = process.argv[2];
if (!fs.existsSync(file)) {
  console.log("### 🎭 E2E — ⚠️ no report produced");
  process.exit(0);
}
const r = JSON.parse(fs.readFileSync(file, "utf8"));
const rows = [];
const walk = (suite, path = []) => {
  for (const s of suite.suites ?? [])
    walk(s, s.title && !s.title.endsWith(".ts") ? [...path, s.title] : path);
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests) {
      const res = t.results.at(-1);
      const icon =
        { expected: "✅", flaky: "⚠️", unexpected: "❌", skipped: "⏭️" }[t.status] ?? t.status;
      rows.push(
        `| ${icon} | ${t.projectName} | ${[...path, spec.title].join(" › ")} | ${((res?.duration ?? 0) / 1000).toFixed(1)}s |`,
      );
    }
};
walk(r);
const st = r.stats;
const icon = st.unexpected ? "❌" : st.flaky ? "⚠️" : "✅";
console.log(
  `### 🎭 E2E — ${icon} ${st.expected} passed, ${st.unexpected} failed, ${st.flaky} flaky (${(st.duration / 1000).toFixed(1)}s)\n`,
);
console.log("| | Viewport | Test | Time |\n|---|---|---|---|\n" + rows.join("\n"));
