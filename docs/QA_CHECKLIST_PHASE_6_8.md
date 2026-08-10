# QA Checklist — Optimum 6.8 Project & Document Control OS

## Release automation gates
- [x] Full static/regression suite (`npm test`)
- [x] Contract audit: 237 actions / 54 forms / 101 RPC references
- [x] Browser Core
- [x] Browser Policy / Platform Console
- [x] Browser Work OS
- [x] Browser Work Experience Excellence
- [x] Browser PDC Owner
- [x] Browser PDC Limited Engineer
- [x] Browser PDC Mobile 390px
- [x] Live Owner smoke with rollback
- [x] Live scoped Engineer rename/move smoke with rollback
- [x] Live Blueprint/Archive/Storage RLS smoke with rollback
- [x] Supabase Security Advisor reviewed
- [x] Supabase Performance Advisor reviewed; new unindexed FKs fixed
- [x] Portable client/platform HTTP + headers
- [ ] Next production build — blocked by unavailable dependency in internal npm registry
- [ ] Full Fresh DB migration replay — CLI/Postgres/Docker unavailable in this environment

## User acceptance — Test company only
1. Create Project using Fiber or Construction Blueprint; confirm expected folder structure is generated.
2. Open Project 360; use direct Files / Work / Drawings / Site links.
3. Create Site, fill manager/address/timezone, open Site 360.
4. Open CDE, navigate project/site/folders, search a document server-side.
5. Open Document 360; verify versions, Work/CAD links and exact context navigation.
6. As Owner/Manager with `files.manage`, change Document Control status and due date.
7. As limited Engineer with rename/move only, verify Rename/Move work while control/trash/archive controls remain hidden/denied.
8. Archive a Test project after reviewing Impact; verify linked mutations are blocked; Reactivate it and verify work resumes.
9. Upload a Test file and a new version; verify progress/finalize/download and storage usage.
10. Trash a document/folder then restore it; verify original hierarchy/context returns correctly.
11. Search from global search/notifications/activity and confirm exact entity opens, not only the generic page.
12. Test at narrow/mobile width and confirm no horizontal overflow in Project/CDE/Document drawers.

## Production acceptance before public launch
- [ ] Clean dependency install + `next build`
- [ ] Fresh Supabase project replay from migrations
- [ ] SECURITY DEFINER allowlist/threat review
- [ ] Leaked password protection enabled
- [ ] Auth origins/recovery URLs validated
- [ ] Backup/restore drill
- [ ] Monitoring/error reporting
- [ ] Load test with large folder/document/version dataset
