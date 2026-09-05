import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch (error) {
  console.error('Unable to parse npm audit JSON:', error);
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(2);
}

const vulnerabilities = Object.entries(report.vulnerabilities || {});
const critical = vulnerabilities
  .filter(([, details]) => details?.severity === 'critical')
  .map(([name, details]) => ({
    name,
    range: details.range,
    via: (details.via || []).map((entry) => typeof entry === 'string'
      ? entry
      : { source: entry.source, name: entry.name, title: entry.title, url: entry.url, range: entry.range }),
    effects: details.effects || [],
    fixAvailable: details.fixAvailable,
  }));

const counts = report.metadata?.vulnerabilities || {};
console.log('Production dependency audit summary:', counts);

if (critical.length) {
  console.error(`Critical production vulnerabilities (${critical.length}):`);
  console.error(JSON.stringify(critical, null, 2));
  process.exit(1);
}

console.log('No critical production dependency vulnerability detected.');
