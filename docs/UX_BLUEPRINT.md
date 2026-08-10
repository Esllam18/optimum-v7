# Optimum — UX Blueprint

## 1. Experience goals

- A non-technical user understands each screen without training.
- Cards provide visual navigation; the tree provides speed.
- Users always know company, project, site, folder, and file context.
- The primary action remains visible and permissions remove unavailable actions.
- Dark and light themes feel purpose-built, not inverted.
- Arabic and English retain natural hierarchy and interaction order.

## 2. Global shell

### Sidebar

Contains company/platform switcher, permission-aware navigation, phase status, and logout.

### Top bar

Contains current page, global command/search, contextual help, notifications, language, theme, and account menu.

### Contextual help

Every main page has a page-specific help drawer with numbered steps, permission behavior, and practical tips.

### Command palette

`Ctrl/Cmd + K` opens navigation and global search. Search results carry enough context to open the correct scope.

## 3. Platform Owner journey

1. Sign in.
2. Open Platform Control.
3. Review company status, plan, members, projects, and storage.
4. Create a client company.
5. Select plan, initial status, trial duration, and owner email.
6. Copy the generated activation link.
7. Send it to the owner through the agreed communication channel.
8. Later edit plan, status, dates, or custom limits.

Suspending a company clearly explains that data remains intact while operational actions stop.

## 4. Company owner activation

1. Open the secure invitation URL.
2. The registration form is available only because an invitation token is present.
3. Register using the invited email and a personal password.
4. Confirm email when Supabase confirmation is enabled.
5. Sign in; the application accepts the invitation and loads the company.
6. Invite company employees from Team.

Public self-service company creation is not shown.

## 5. Files Workspace journey

1. Open Files Workspace.
2. Choose a project.
3. Choose project-level files or a specific site.
4. Use folder cards for primary navigation or the side tree for direct navigation.
5. Breadcrumbs confirm current location.
6. Create custom folders only where needed.
7. Upload one or many files.
8. Review each selected file:
   - display name;
   - new document or new version;
   - target existing document when applicable.
9. Track upload outcome through toasts and refreshed file cards.
10. Open a document drawer to review metadata and version history.

## 6. File/version flows

### First upload

- Select files or drag them into the upload area.
- Enter document type, description, and tags once for the batch.
- Confirm each file's display name.
- Reserve metadata in the database.
- Upload the binary to private storage.
- Finalize the version only after the object exists.
- Abort and clean incomplete metadata if upload fails.

### New version

- Open an existing document.
- Choose New version.
- Select the binary and enter a change note.
- Upload creates the next sequential version.
- Previous versions remain downloadable and unchanged.

### Similar-name suggestion

A normalized name match inside the current folder proposes “new version.” The user can switch to “new document.” This is guidance, not an irreversible automatic decision.

## 7. Trash and recovery

- Trash operations require confirmation.
- Trashing a custom folder also trashes descendants and contained documents.
- System folders cannot be trashed.
- Restore the parent before restoring its children.
- No permanent-delete action is exposed in Phase 2.

## 8. Search

- Open with `Ctrl/Cmd + K`.
- Type at least two characters.
- Search projects, sites, folders, and documents.
- Results show entity type and secondary context.
- Selecting a result updates project/site/folder state and opens the entity.

## 9. Page map

| Page | Purpose | Main action |
|---|---|---|
| Platform Control | Provision and manage client companies | Add company |
| Dashboard | Company summary and quick actions | Contextual quick action |
| Team | Members and invitations | Invite member |
| Roles | Role permission defaults | Edit role |
| Projects | Project/site containers | Create project |
| Files Workspace | Folder and file operations | Upload files |
| Trash | Recover soft-deleted items | Restore |
| Activity | Immutable company event history | Refresh |
| Settings | Profile, theme, language, company settings | Save |

## 10. State design

- **Loading:** skeletons preserve layout.
- **Empty:** icon, title, explanation, and permitted next action.
- **Error:** plain-language toast while preserving user input when possible.
- **Success:** non-blocking toast; important generated invite links use a result dialog.
- **Blocked subscription:** persistent banner with read-only company basics and hidden/blocked operations.
- **Upload:** review state before action; success only after storage finalization.

## 11. Responsive behavior

- Desktop: sidebar, folder tree, dense cards/tables.
- Tablet: narrower tree and two-column cards.
- Mobile: off-canvas application navigation, stacked selectors, single-column cards, scroll-safe dialogs/drawers.
- Controls target approximately 40–44 px minimum interaction size.

## 11. Work Management journeys

### Employee journey

1. Open **My Work** from the sidebar or dashboard.
2. See overdue and due-today work before lower-priority items.
3. Open the task and understand context, deadline, responsible people, and expected outcome.
4. Start work, update progress/checklist, comment, and attach evidence.
5. Complete with a final note.

### Manager journey

1. Open **Team** to see all company work.
2. Filter by project/status or use search.
3. Create a task and choose members, roles, or Open for anyone.
4. Link it directly to the relevant project, site, folder, or document.
5. Review blockers, overdue work, comments, attachments, and the immutable timeline.

### Interaction rules

- Assignment choices adapt to permission level instead of presenting actions that will fail.
- Private mode cannot include assignees.
- Open work must be explicitly claimed before normal execution.
- Board and list are equal views of the same data; filters persist during the session.
- The calendar uses due date first and start date as fallback.

---

# Phase 4 UX Addendum

The editor uses four stable zones: compact top toolbar, catalog palette, large sheet canvas, and properties/takeoff area. A user can create the common drawing without opening modal dialogs for every symbol. Placing and connecting elements uses direct manipulation; technical values are edited in the inspector. The live BOQ is always visible below the drawing.

Comparison mode never modifies data. Draft editing is disabled after issue/approval; the user creates a new revision instead. Unsaved-draft state is visible in the editor header.
