// Usage: node test-summary.cjs "<label>" <junit.xml> [coverage-summary.json]
// Prints a Markdown summary (test counts + coverage table) for $GITHUB_STEP_SUMMARY.
const fs = require("fs");
const [label, junit, coverage] = process.argv.slice(2);
const out = [];
if (junit && fs.existsSync(junit)) {
  const x = fs.readFileSync(junit, "utf8");
  const m = x.match(
    /<testsuites[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"[^>]*time="([\d.]+)"/,
  );
  if (m) {
    const [, tests, failures, errors, time] = m;
    const failed = Number(failures) + Number(errors);
    out.push(
      `### ${label} — ${failed ? "❌" : "✅"} ${tests - failed}/${tests} passed in ${Number(time).toFixed(2)}s`,
    );
  }
} else {
  out.push(`### ${label} — ⚠️ no JUnit report`);
}
if (coverage && fs.existsSync(coverage)) {
  const t = JSON.parse(fs.readFileSync(coverage, "utf8")).total;
  const row = (k, name, min) =>
    `| ${name} | ${t[k].pct}% | ${t[k].covered}/${t[k].total} | ${min}% | ${t[k].pct >= min ? "✅" : "❌"} |`;
  out.push(
    "",
    "| Coverage | % | Covered | Threshold | |",
    "|---|---|---|---|---|",
    row("lines", "Lines", 70),
    row("statements", "Statements", 70),
    row("functions", "Functions", 70),
    row("branches", "Branches", 60),
  );
}
console.log(out.join("\n") + "\n");
