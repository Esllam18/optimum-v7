import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as core from '../src/v7/lib/cadCore.js';
import * as legacy from '../assets/engineering.js';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const cad = read('src/v7/components/CadWorkspace.js');
const engineering = read('src/v7/pages/EngineeringPage.js');
const app = read('src/v7/V7App.js');
const firstLogin = read('src/v7/components/FirstLoginSecurity.js');
const telemetry = read('src/v7/lib/telemetry.js');
const apiClient = read('src/v7/lib/api.js');
const boundary = read('src/v7/components/V7ErrorBoundary.js');
const migration = read('supabase/migrations/20260810092620_v7_client_telemetry.sql');
const telemetryHardening = read('supabase/migrations/20260810092938_v7_client_telemetry_performance_hardening.sql');

assert.match(cad, /from '\.\.\/lib\/cadCore'/, 'V7 CAD must load the extracted V7 core module');
assert.doesNotMatch(cad, /assets\/engineering\.js/, 'V7 CAD must not import the 6.9 engineering runtime');
assert.doesNotMatch(engineering, /\/#\/engineering|Legacy editor|المحرر القديم/, 'V7 Engineering must not route users back to the 6.9 UI');
assert.doesNotMatch(app, /location\.assign\('\/'\).*legacy|First-login security setup required/, 'V7 must not depend on the legacy UI for login/security setup');
assert.match(app, /FirstLoginSecurity/, 'V7 must own its first-login security experience');
assert.match(firstLogin, /identity-provisioning-v55/, 'First-login must use the trusted provisioning edge contract');
assert.match(firstLogin, /action: 'complete_first_login'/, 'First-login must call the canonical secure action');
assert.doesNotMatch(firstLogin, /updateCurrentUser\(\{ password/, 'Provisioned first-login password changes must not bypass the trusted edge flow');

assert.match(app, /telemetry\.init\(api\)/, 'V7 must initialize client diagnostics');
assert.match(app, /V7ErrorBoundary/, 'V7 must contain render failures');
assert.match(telemetry, /unhandledrejection/, 'V7 must capture unhandled promise failures');
assert.match(telemetry, /slow_request/, 'V7 must capture slow API diagnostics');
assert.match(telemetry, /sessionStorage/, 'Pre-workspace telemetry must buffer without blocking product flows');
assert.match(telemetry, /sanitizeContext/, 'Telemetry context must be bounded before it reaches the database contract');
assert.match(telemetry, /returning: false, invalidate: false/, 'Diagnostics writes must not invalidate domain read caches');
assert.match(telemetry, /queueMicrotask\(\(\) => this\.flush\(\)\)/, 'Successful telemetry batches must drain the remaining backlog');
assert.match(apiClient, /invalidate = true/, 'Generic inserts must support explicit cache invalidation control');
assert.match(boundary, /componentDidCatch/, 'React render errors must be captured by an error boundary');
assert.match(migration, /enable row level security/i);
assert.match(migration, /grant insert on table public\.client_telemetry_events to authenticated/i);
assert.doesNotMatch(migration, /grant select .*client_telemetry_events.*authenticated/i, 'Client telemetry must be write-only to normal users');
assert.match(migration, /m\.status = 'active'/);
assert.match(telemetryHardening, /user_id = \(select auth\.uid\(\)\)/, 'Telemetry RLS must use the init-plan-safe auth.uid form');
assert.match(telemetryHardening, /idx_client_telemetry_user_created/, 'Telemetry must cover its auth.users foreign key');
assert.doesNotMatch(migration + telemetryHardening, /security definer/i, 'Telemetry ingestion must not add another SECURITY DEFINER RPC');

const snapshot = {
  version: 8,
  nodes: [
    { id:'n1', catalogCode:'TB-24C', x:160, y:180, label:'TB 01', properties:{ boxNo:'01', capacity:24, ports:24, odfCode:'ODF-A' } },
    { id:'n2', catalogCode:'TB-24C', x:560, y:180, label:'TB 02', properties:{ boxNo:'02', capacity:24, ports:24 } }
  ],
  routes: [
    { id:'r1', catalogCode:'DUCT-4W-7/3.5', sourceNodeId:'n1', targetNodeId:'n2', points:[{x:160,y:180},{x:560,y:180}], manualLength:120, properties:{ cableCode:'FO-24C', numberOfCables:1, installation:'underground' } }
  ],
  annotations: [], manualBoq: []
};
const catalog = [
  { code:'TB-24C', category:'node', unit:'ea', name_en:'Termination box', name_ar:'بوكس نهايات', default_properties:{} },
  { code:'DUCT-4W-7/3.5', category:'route', unit:'m', name_en:'Microduct', name_ar:'ميكرو دكت', default_properties:{} }
];
const settings = { width: 900, height: 600, grid:20, meterPerDrawingUnit:1, titleBlock:false };
const metadata = { drawingNo:'DR-001', title:'Parity', revision:'R1', status:'DRAFT', date:'2026-08-10', catalog };

assert.deepEqual(core.normalizeEngineeringSnapshot(snapshot), legacy.normalizeEngineeringSnapshot(snapshot));
assert.deepEqual(core.calculateEngineeringTakeoff(snapshot, catalog, settings), legacy.calculateEngineeringTakeoff(snapshot, catalog, settings));
assert.deepEqual(core.validateEngineeringSnapshot(snapshot, catalog, settings), legacy.validateEngineeringSnapshot(snapshot, catalog, settings));
assert.equal(core.exportEngineeringDxfCompatible(snapshot, metadata, { ...settings, catalog }), legacy.exportEngineeringDxfCompatible(snapshot, metadata, { ...settings, catalog }));
assert.equal(core.engineeringSnapshotSvg(snapshot, { settings, catalog, metadata, locale:'en' }), legacy.engineeringSnapshotSvg(snapshot, { settings, catalog, metadata, locale:'en' }));

console.log('V7 native runtime + observability 7.0 contract: PASS');
