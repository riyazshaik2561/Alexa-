# Alexa+ — CampusPilot AI

A full-stack, locally runnable hackathon prototype demonstrating an action-oriented academic assistant. The landing page uses a custom animated Alexa-inspired orb visual (not an official Amazon device render), scroll-reactive ambient canvas, responsive editorial layout, assistant workspace, tasks, notes, and an auditable activity feed.

> **Important:** This is an independent prototype, not an official Amazon/Alexa+ product and not connected to an Alexa device or a live Amazon AI service. The included agent uses deterministic intent routing and local tools so its behavior can be demonstrated transparently. Do not present the simulated agent as a production Alexa+ integration.

## Requirements
- Node.js 20+ (Node 22 recommended)
- npm

## Run locally
```bash
npm install
npm run dev
```
- Frontend: http://localhost:5173
- API: http://localhost:4174/api/health

## Production build / run
```bash
npm install
npm run build
NODE_ENV=production npm start
```
The Express server serves the built client and API on port `4174` by default. Set `PORT` to change it.

## Included features
- Responsive single-page cinematic landing experience with two editorial hero/statement sections and a product workspace.
- Locally rendered animated orb on a fixed canvas; scroll progress influences the visual; no remote media required.
- Agent chat with suggested prompts, local task creation/completion, study-plan generation, progress summary, and saved-note search.
- Task CRUD (create, complete, delete; API also supports updates), priorities, categories, optional due dates.
- Knowledge notes stored in SQLite.
- Activity trail for tool calls and task/note changes.
- SQLite database auto-created at `data/campuspilot.sqlite`.
- Demo reset action, keyboard focus styles, reduced-motion support, responsive layout, and accessible labels.

## Database
SQLite is bundled through `better-sqlite3`; the database file is created on first server launch. Back up `data/campuspilot.sqlite` if you want to preserve demo data. Do not commit real personal or sensitive information into a public repository.

## Deploying
This is a standard Node full-stack project. Deploy to a host that supports a persistent Node process and writable filesystem. Because SQLite stores data in `data/campuspilot.sqlite`, ephemeral/serverless hosting may reset the database; use a persistent disk or replace SQLite with a managed database for that environment. Build with `npm run build`, then run `NODE_ENV=production npm start`.

## Project structure
```text
client/
  public/assets/alexa-orb.svg
  src/App.tsx
  src/main.tsx
  src/styles.css
server/index.ts
data/                  # SQLite DB auto-created here
index.html
vite.config.ts
package.json
```
