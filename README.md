# SignalDesk — Social Publishing Workspace Prototype

A responsive, browser-based prototype for a multi-client social media management platform. It is an original starter project inspired by common social media management workflows, not a copy of Social News Desk.

## Run it
1. Unzip the folder.
2. Open `index.html` in a modern browser, or open the folder in VS Code and use the Live Server extension.
3. No build step or package installation is required.

## Included in this prototype
- Command Center with sample performance metrics and upcoming content
- Content Calendar with month navigation and demo posts
- Publishing Studio with multi-account selection, live caption preview, character count, optional local media preview, draft save, review submit, and scheduling actions
- Content Library with searchable sample assets
- Social Inbox with sample conversations and a simulated reply flow
- Analytics dashboard with sample metrics and CSV export
- Client workspaces and add-client demo flow
- Team approval queue with simulated approval actions
- Settings page

## Important prototype limitations
- All sample metrics and accounts are fictional/demo data.
- Scheduling, approvals, and replies are simulated in the current browser session. Posts are not sent to social networks.
- This frontend does not yet have authentication, a shared database, secure team collaboration, persistent server-side scheduling, or live social APIs.
- Live publishing/inbox access requires provider-specific API permissions, OAuth, backend services, and compliance with each platform's rules.

## Suggested next build phase
1. Move demo data into a small state/data layer.
2. Add a backend and database (e.g. Supabase/PostgreSQL).
3. Add authentication and organization/client-level permissions.
4. Build secure OAuth connections for approved social APIs.
5. Add real publishing, scheduling workers, and post status/error handling.
6. Add analytics ingestion, team invitations, audit logs, and production tests.

## Project structure
- `index.html` — page structure
- `css/styles.css` — responsive visual design
- `js/app.js` — demo data, navigation, and interactions

## Import into Replit
Push this folder to a GitHub repository, then import the repository into Replit. Keep Git as the source of truth and avoid editing the same files independently in VS Code and Replit without committing/syncing.
