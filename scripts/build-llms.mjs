// Assembles llms-full.txt (README + agent skill + every example schema) for the demo site.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const examples = readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.json')).sort();

const out = [
  '# react-simple-schema-form — full documentation for LLMs',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} from README.md, skills/react-simple-schema-form/SKILL.md and examples/*.json.`,
  '',
  '---',
  '',
  '# README',
  '',
  read('README.md'),
  '',
  '---',
  '',
  '# Agent skill',
  '',
  read('skills/react-simple-schema-form/SKILL.md').replace(/^---[\s\S]*?---\n/, ''),
  '',
  '---',
  '',
  '# Example schemas',
  '',
  '# schema.json (the demo default)',
  '',
  '```json',
  read('schema.json').trim(),
  '```',
  '',
  ...examples.flatMap((f) => [`## examples/${f}`, '', '```json', read(`examples/${f}`).trim(), '```', '']),
].join('\n');

writeFileSync(join(root, 'demo/public/llms-full.txt'), out);
console.log(`wrote demo/public/llms-full.txt (${(out.length / 1024).toFixed(0)} kB)`);
