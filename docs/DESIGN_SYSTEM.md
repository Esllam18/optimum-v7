# Optimum — Design System 2.0

## 1. Direction

Modern, premium, calm, fast, and operational. Optimum should feel like a professional workspace rather than a generic admin template.

Dark and light modes share semantic behavior but use independent surfaces and depth values.

## 2. Color tokens

### Light theme

| Token | Value |
|---|---|
| Background | `#F5F7FB` |
| Soft background | `#EDF1F8` |
| Surface | `#FFFFFF` |
| Surface 2 | `#F8FAFF` |
| Surface 3 | `#EEF3FB` |
| Text | `#101828` |
| Text secondary | `#475467` |
| Text muted | `#667085` |
| Border | `#DFE5EF` |
| Border strong | `#C9D2E1` |
| Primary | `#5B5CE2` |
| Primary hover | `#4A4BC9` |
| Success | `#0E9F6E` |
| Warning | `#D97706` |
| Danger | `#DC3545` |
| Info | `#2563EB` |

### Dark theme

| Token | Value |
|---|---|
| Background | `#07111F` |
| Soft background | `#091626` |
| Surface | `#0D1A2B` |
| Surface 2 | `#101F33` |
| Surface 3 | `#14263D` |
| Text | `#F4F7FB` |
| Text secondary | `#B7C1D0` |
| Text muted | `#8190A5` |
| Border | `#20334C` |
| Border strong | `#304762` |
| Primary | `#7A83FF` |
| Primary hover | `#9198FF` |
| Success | `#46C99B` |
| Warning | `#F4B557` |
| Danger | `#FF727F` |
| Info | `#6FA1FF` |

Semantic colors must be used by token, never by copying random values into components.

## 3. Typography

System font stack avoids blocking the first render:

```css
Inter, "Segoe UI", Tahoma, Arial, sans-serif
```

Arabic and English share a clear scale:

- Display: 36–68 px
- Page title: 23–30 px
- Section title: 16–20 px
- Card title: 12–16 px
- Body: 14 px
- Supporting copy: 11–13 px
- Metadata: 9–11 px

Weights: 400, 600/650, 700/750, 800/850.

## 4. Spacing

Base scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

Logical properties (`padding-inline`, `inset-inline`) are preferred so RTL/LTR work without duplicate components.

## 5. Shape and elevation

- Small radius: 8 px
- Control radius: 11–13 px
- Card radius: 14–16 px
- Dialog radius: 20 px
- Large panel radius: 22 px
- Pill: 999 px

Shadows are restrained. Borders define normal hierarchy; shadow indicates raised overlays or hover emphasis.

## 6. Icons

A consistent 24×24 outline language with rounded strokes is embedded locally. No icon font or runtime icon dependency is required.

Common sizes:

- inline: 14–18 px
- buttons/navigation: 18–20 px
- visual card art: 24–30 px

Icons never replace text for critical actions.

## 7. Buttons

Variants:

- Primary
- Secondary
- Ghost
- Danger
- Danger soft
- Icon button
- Small / default / large / block

States:

- default
- hover
- active
- focus-visible
- disabled
- busy

One primary button per local decision area.

## 8. Forms

- Input, select, and textarea share height, radius, border, focus ring, and surface behavior.
- Labels are always visible.
- Native validation is combined with backend validation.
- Long forms use grouped two-column rows on desktop and one column on mobile.
- Dialog submit controls are disabled while busy.
- Slugs use explicit patterns and human-readable labels.

## 9. Cards

### Folder card

Contains folder icon, localized name, code/metadata, favorites, and permission-aware actions. Clicking the main area enters the folder.

### Document card

Contains file-type art, display name, original filename/size metadata, version badge, favorite control, and detail action.

### Platform/company card or row

Shows plan, status, member/project usage, storage progress, and edit action.

### Rules

- Entire main card region is clickable.
- Hover is subtle: border, small translation, limited shadow.
- Actions do not move between states.
- Trashed state reduces emphasis without hiding identity.

## 10. Tables

- Sticky-friendly headers and scroll-safe wrapper.
- Clear row hierarchy and compact entity cell.
- Actions stay in the final logical column.
- Status uses text and badge, not color alone.
- Platform limits and storage usage show both numeric values and progress.

## 11. Dialogs and drawers

### Dialog

Used for focused creation/edit/confirmation. Structure:

- sticky header
- title and supporting copy
- scrollable body
- optional sticky footer

### Drawer

Used for contextual detail such as project, document/version history, notifications, and help. It preserves the page behind it.

Escape and background click close overlays unless doing so would risk an in-progress operation.

## 12. Empty states

Every empty state includes:

- contextual icon
- short title
- one explanatory sentence
- one permitted next action when applicable

Examples: no companies, no projects, no files in folder, no notifications, no search results.

## 13. Loading

- Page skeletons over full-screen spinners.
- Button busy state for mutations.
- Search loading state inside results.
- Upload completion is confirmed only after storage finalization.

## 14. Toasts

Variants:

- success
- error
- information

Toasts contain an icon, title, optional detail, and dismiss action. Important generated links are not placed only in a toast; they use a dialog.

## 15. Motion

- Typical transition: 120–200 ms
- Small translation for card/button feedback
- Drawer/dialog entrance only
- No decorative continuous motion
- `prefers-reduced-motion` disables nonessential animation

## 16. Accessibility

- visible keyboard focus
- semantic headings and labels
- text status alongside color
- correct root `lang` and `dir`
- minimum practical touch size
- no critical action hidden behind hover only
- readable contrast in both themes

## 12. Work Management components

- `TaskKpiCard`: compact operational metric with semantic state.
- `WorkToolbar`: scopes, search, project filter, and board/list control.
- `TaskStatusBadge`: semantic dot plus localized label.
- `TaskPriorityBadge`: low/medium/high/urgent semantic treatment.
- `WorkCard`: concise Kanban card with context, deadline, people, checklist, and discussion counters.
- `KanbanColumn`: independently scrollable status lane.
- `TaskTable`: dense alternative for scanning many items.
- `TaskDialog`: two-column creation/editing surface with work context and ownership.
- `TaskDrawer`: execution workspace for progress, checklist, files, comments, and timeline.
- `CalendarCell` and `CalendarTask`: monthly schedule representation.

The light and dark themes use the same semantic tokens but independent surfaces. Urgent, overdue, blocked, and completed states never rely on color alone; text/icon/status labels remain visible.

---

# Phase 4 Components

- Engineering drawing cards and register toolbar.
- Compact CAD toolbar with active/hover/disabled states.
- Catalog palette items and route swatches.
- A3 sheet canvas with grid, title block, legend, node, route, annotation, and review-mark primitives.
- Property inspector fields.
- Live BOQ table.
- Revision timeline, compare banner, export cards, and review-mark list.

The product UI remains dark/light aware, but the printed engineering sheet stays high-contrast white for predictable PDF and DXF workflows.
