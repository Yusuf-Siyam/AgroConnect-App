import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { FARMER_MORE_HREFS, isKnownRolePath } from './routeManifest';

const appRoot = fileURLToPath(new URL('../../../src/app/', import.meta.url));
const componentsRoot = fileURLToPath(new URL('../../../src/components/navigation/', import.meta.url));

function hasRouteFile(parts: string[]): boolean {
  const base = join(appRoot, ...parts);
  return existsSync(`${base}.tsx`) || existsSync(join(base, 'index.tsx'));
}

function routeExists(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean);
  if (hasRouteFile(parts)) return true;
  // Role tab screens live in a route group and keep the same public URL.
  return parts.length > 1 && hasRouteFile([parts[0]!, '(tabs)', ...parts.slice(1)]);
}

function tabNames(fileName: string): string[] {
  const source = readFileSync(join(componentsRoot, fileName), 'utf8');
  return [...source.matchAll(/<Tabs\.Screen name="([^"]+)"/g)].map((match) => match[1]!);
}

function hubHrefs(): string[] {
  const source = readFileSync(join(appRoot, 'farmer/(tabs)/more.tsx'), 'utf8');
  return [...source.matchAll(/<Link\s+href=(?:\{)?['"]([^'"]+)['"]/g)].map((match) => match[1]!);
}

describe('farmer More tools manifest', () => {
  it('reads every hub href from the screen source', () => {
    assert.deepEqual(hubHrefs(), [...FARMER_MORE_HREFS]);
  });

  for (const href of FARMER_MORE_HREFS) {
    it(`hub href ${href} resolves to a real route file`, () => {
      assert.equal(routeExists(href), true);
    });
  }

  for (const href of FARMER_MORE_HREFS.filter((value) => value !== '/profile')) {
    it(`hub href ${href} is registered in the farmer route manifest`, () => {
      assert.equal(isKnownRolePath('farmer', href), true);
    });
  }
});

describe('role tab manifests', () => {
  for (const role of ['farmer', 'buyer', 'transporter'] as const) {
    const fileName = `${role[0]!.toUpperCase()}${role.slice(1)}Tabs.tsx`;

    for (const name of tabNames(fileName)) {
      it(`${role} tab ${name} resolves to a real route file`, () => {
        assert.equal(routeExists(`/${role}/${name}`), true);
      });
    }
  }

  it('admin menu resolves to a real route file', () => {
    assert.equal(routeExists('/admin'), true);
  });

  it('farmer tabs no longer hide tool routes', () => {
    const source = readFileSync(join(componentsRoot, 'FarmerTabs.tsx'), 'utf8');
    assert.equal(/href:\s*null/.test(source), false);
  });

  it('buyer tabs no longer hide detail routes', () => {
    const source = readFileSync(join(componentsRoot, 'BuyerTabs.tsx'), 'utf8');
    assert.equal(/href:\s*null/.test(source), false);
  });
});
