import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const srcRoot = path.resolve(process.cwd(), 'src');
const filePattern = /\.tsx$/;

// Only props that render user-facing copy are checked. Style/behavior props
// such as className, onPress and testID are intentionally out of scope.
const uiProps = new Set([
  'title',
  'label',
  'placeholder',
  'accessibilityLabel',
  'accessibilityHint',
  'headerTitle',
  'alt',
  'message',
  'prompt',
]);

// Deliberately tiny: format tokens and unit symbols are not translatable prose.
const ignoredValues = new Set(['YYYY-MM-DD', '°C', 'kg', 'kg ·', 'km', 'BDT', 'BDT ·']);

function collectFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectFiles(fullPath));
    } else if (filePattern.test(entry.name) && !entry.name.endsWith('.test.tsx')) {
      found.push(fullPath);
    }
  }
  return found;
}

function isTailwindClassList(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((token) => /^[a-z][a-z0-9:/[\].()_-]*$/i.test(token) && /[-/:[\]]/.test(token))
  );
}

function isIgnored(value) {
  const text = value.trim();
  return (
    !text || ignoredValues.has(text) || !/[\p{L}]/u.test(text) || isTailwindClassList(text)
  );
}

const findings = [];
const files = collectFiles(srcRoot);

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const relative = path.relative(process.cwd(), file);

  const report = (node, kind, rawValue) => {
    const value = rawValue.trim();
    if (isIgnored(value)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    findings.push(`${relative}:${line} [${kind}] ${JSON.stringify(value)}`);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, 'jsx text', node.text);

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sourceFile);
      if (uiProps.has(name)) report(node, `prop:${name}`, node.initializer.text);
    }

    if (ts.isPropertyAssignment(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
      if (uiProps.has(name)) report(node, `object:${name}`, node.initializer.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

if (findings.length > 0) {
  console.error('check:i18n failed. Move these literal UI strings into src/locales/ and use t():');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`check:i18n passed: ${files.length} TSX files have no literal user-facing strings.`);
