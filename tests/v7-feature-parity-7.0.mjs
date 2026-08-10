import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('src/v7/V7App.js');
const shell = read('src/v7/components/Shell.js');
const i18n = read('src/v7/lib/i18n.js');
const work = read('src/v7/pages/WorkPage.js');
const nextConfig = read('next.config.mjs');

const requiredPages = [
  ['calendar', 'CalendarPage.js'],
  ['organization', 'OrganizationPage.js'],
  ['roles', 'RolesPage.js'],
  ['activity', 'ActivityPage.js'],
  ['settings', 'SettingsPage.js'],
  ['trash', 'TrashPage.js'],
  ['work-intelligence', 'WorkIntelligencePage.js']
];

const failures = [];
const pass = (name, ok, detail='') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

for (const [route, file] of requiredPages) {
  pass(`page:${route}`, fs.existsSync(`src/v7/pages/${file}`));
  pass(`route:${route}`, app.includes(`route.key === '${route}'`));
}

for (const route of ['calendar','organization','roles','activity','settings','trash']) {
  pass(`nav:${route}`, shell.includes(`href: '/v7/${route}'`));
  pass(`i18n:${route}`, i18n.includes(`${route}:`));
}

const contracts = {
  'CalendarPage.js': ['work_calendar_feed','work_capacity_plan'],
  'OrganizationPage.js': ['save_organization_unit','save_company_work_settings','organization_health_snapshot'],
  'RolesPage.js': ['replace_role_permissions','create_company_role'],
  'ActivityPage.js': ['work_activity_feed'],
  'SettingsPage.js': ['save_company_branding','company_subscriptions','service_plans'],
  'TrashPage.js': ['trash_query','restore_folder','restore_document'],
  'WorkIntelligencePage.js': ['work_cockpit_snapshot','work_capacity_plan','work_dependency_graph','work_leave_requests']
};
for (const [file, names] of Object.entries(contracts)) {
  const src = read(`src/v7/pages/${file}`);
  for (const name of names) pass(`contract:${file}:${name}`, src.includes(name));
}

pass('work:advanced-ops-entry', work.includes("router.push('/v7/work-intelligence')"));
pass('arabic:login-story', app.includes('نظام تشغيل التسليم') && app.includes('بدون ضوضاء التشغيل'));
pass('arabic:calendar', read('src/v7/pages/CalendarPage.js').includes('التقويم التشغيلي'));
pass('arabic:roles', read('src/v7/pages/RolesPage.js').includes('الأدوار والصلاحيات'));
pass('arabic:settings', read('src/v7/pages/SettingsPage.js').includes('بيانات الشركة'));
pass('vercel:managed-output', nextConfig.includes("process.env.VERCEL === '1'") && nextConfig.includes("output: 'standalone'"));
pass('engineering:production-jsx-fix', !read('src/v7/pages/EngineeringPage.js').includes('actions={}>'));

console.log(`\nV7 feature parity gate: ${failures.length ? `NO-GO (${failures.length})` : 'GO'}`);
if (failures.length) process.exit(1);
