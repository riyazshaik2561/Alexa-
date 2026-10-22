import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'campuspilot.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Study', priority TEXT NOT NULL DEFAULT 'medium', dueDate TEXT, completed INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, tool TEXT NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'success', createdAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const app = express();
app.use(cors()); app.use(express.json({ limit: '1mb' }));
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
function log(tool: string, detail: string, status = 'success') {
  db.prepare('INSERT INTO activity (id, tool, detail, status, createdAt) VALUES (?, ?, ?, ?, ?)').run(id(), tool, detail, status, now());
}
function taskShape(row: any) { return { ...row, completed: Boolean(row.completed) }; }
app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'CampusPilot AI', database: 'SQLite' }));
app.get('/api/tasks', (_req, res) => res.json(db.prepare('SELECT * FROM tasks ORDER BY completed ASC, dueDate ASC, createdAt DESC').all().map(taskShape)));
app.post('/api/tasks', (req, res) => {
  const { title, category = 'Study', priority = 'medium', dueDate = '' } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Task title is required.' });
  const task = { id: id(), title: title.trim().slice(0, 180), category: String(category).slice(0, 60), priority: ['low','medium','high'].includes(priority) ? priority : 'medium', dueDate: String(dueDate).slice(0, 30), completed: 0, createdAt: now() };
  db.prepare('INSERT INTO tasks (id,title,category,priority,dueDate,completed,createdAt) VALUES (@id,@title,@category,@priority,@dueDate,@completed,@createdAt)').run(task);
  log('add_task', `Created task: ${task.title}`); res.status(201).json(taskShape(task));
});
app.patch('/api/tasks/:id', (req, res) => {
  const existing: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Task not found.' });
  const body = req.body ?? {};
  const next = { ...existing, title: typeof body.title === 'string' ? body.title.trim().slice(0,180) : existing.title, category: body.category ?? existing.category, priority: ['low','medium','high'].includes(body.priority) ? body.priority : existing.priority, dueDate: body.dueDate ?? existing.dueDate, completed: body.completed === undefined ? existing.completed : (body.completed ? 1 : 0) };
  db.prepare('UPDATE tasks SET title=?,category=?,priority=?,dueDate=?,completed=? WHERE id=?').run(next.title,next.category,next.priority,next.dueDate,next.completed,req.params.id);
  log('update_task', `${next.completed ? 'Completed' : 'Updated'} task: ${next.title}`); res.json(taskShape(next));
});
app.delete('/api/tasks/:id', (req, res) => { const r = db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id); if (!r.changes) return res.status(404).json({error:'Task not found.'}); log('delete_task', 'Deleted a task'); res.status(204).end(); });
app.get('/api/notes', (_req, res) => res.json(db.prepare('SELECT * FROM notes ORDER BY createdAt DESC').all()));
app.post('/api/notes', (req, res) => { const { title, body } = req.body ?? {}; if (!String(title ?? '').trim() || !String(body ?? '').trim()) return res.status(400).json({error:'Note title and body are required.'}); const n = { id:id(), title:String(title).trim().slice(0,140), body:String(body).trim().slice(0,8000), createdAt:now() }; db.prepare('INSERT INTO notes VALUES (@id,@title,@body,@createdAt)').run(n); log('save_note', `Saved note: ${n.title}`); res.status(201).json(n); });
app.delete('/api/notes/:id', (req,res) => { const r=db.prepare('DELETE FROM notes WHERE id=?').run(req.params.id); if(!r.changes) return res.status(404).json({error:'Note not found.'}); log('delete_note','Deleted a note'); res.status(204).end(); });
app.get('/api/activity', (_req,res) => res.json(db.prepare('SELECT * FROM activity ORDER BY createdAt DESC LIMIT 30').all()));
app.post('/api/agent', (req,res) => {
  const text = String(req.body?.message ?? '').trim(); if (!text) return res.status(400).json({error:'Message is required.'});
  const lower = text.toLowerCase(); const tasks = db.prepare('SELECT * FROM tasks ORDER BY completed ASC, dueDate ASC').all().map(taskShape); let reply = ''; let tool = 'understand_request'; let detail = 'Interpreted user intent';
  if (/plan|revision|revise|exam|study schedule/.test(lower)) {
    tool = 'create_study_plan'; const subjects = text.match(/(?:for|subjects?:?)\s+(.+)/i)?.[1] ?? 'your priority subjects';
    reply = `Here’s a practical 3-day revision plan for ${subjects.replace(/[.!?]+$/,'')}:\n\nDAY 1 · Understand — review core concepts and write short notes.\nDAY 2 · Practice — solve questions and revisit weak areas.\nDAY 3 · Recall — take a timed mini-test, check mistakes, and do a light final review.\n\nI can also turn any of these steps into tracked tasks. Tell me the subject or topic you want to start with.`;
  } else if (/add|create|remind me|new task|assignment/.test(lower)) {
    const title = text.replace(/^(please\s+)?(add|create|remind me to|new task:?|break my assignment into tasks:?)/i,'').trim() || 'Review study materials';
    const task = { id:id(), title:title.slice(0,180), category:/assignment/.test(lower)?'Assignment':'Study', priority:/urgent|important|today/.test(lower)?'high':'medium', dueDate:'', completed:0, createdAt:now() };
    db.prepare('INSERT INTO tasks (id,title,category,priority,dueDate,completed,createdAt) VALUES (@id,@title,@category,@priority,@dueDate,@completed,@createdAt)').run(task);
    tool='add_task'; detail=`Created task: ${task.title}`; reply=`Done — I added “${task.title}” to your task list with ${task.priority} priority. You can edit the deadline or mark it complete from Tasks.`;
  } else if (/complete|finished|mark .*done/.test(lower)) {
    const target = lower.replace(/.*(?:complete|finished|mark)\s*/,'').replace(/\s*(as done|done|complete)$/,'').trim(); const match = tasks.find(t => !t.completed && (t.title.toLowerCase().includes(target) || target.includes(t.title.toLowerCase())));
    if (match) { db.prepare('UPDATE tasks SET completed=1 WHERE id=?').run(match.id); tool='update_task'; detail=`Completed task: ${match.title}`; reply=`Nice work — I marked “${match.title}” as complete.`; } else { tool='read_tasks'; reply='I couldn’t confidently match that to an open task. Open Tasks to choose the exact item, or tell me a few words from its title.'; }
  } else if (/progress|summari[sz]e|what.*focus|priorit|today/.test(lower)) {
    tool='read_tasks'; const open=tasks.filter(t=>!t.completed); const done=tasks.filter(t=>t.completed); const top=open[0]; reply=`Here’s your current snapshot: ${done.length} task${done.length===1?'':'s'} completed and ${open.length} still open.\n\n${top ? `A good next step is “${top.title}” (${top.priority} priority).` : 'You have no open tasks right now — enjoy the breathing room or add your next goal.'}\n\nTry one focused 25-minute session, then take a short break. This is a local prototype recommendation based on your saved task list.`;
  } else if (/note|remember|knowledge/.test(lower)) {
    tool='search_notes'; const notes=db.prepare('SELECT title,body FROM notes ORDER BY createdAt DESC').all() as any[]; const words=lower.split(/\W+/).filter((w:string)=>w.length>3); const found=notes.filter(n=>words.some((w:string)=>`${n.title} ${n.body}`.toLowerCase().includes(w))).slice(0,3); reply=found.length?`I found these relevant notes:\n\n${found.map(n=>`• ${n.title}: ${n.body.slice(0,260)}${n.body.length>260?'…':''}`).join('\n\n')}`:'I didn’t find a matching saved note yet. Add your notes in the Knowledge section and I’ll search them here.';
  } else { reply='I can help plan revision, add a task, review your progress, mark a task complete, or search your saved notes. Try “Plan my exam revision for 3 days” or “What should I focus on today?”'; }
  log(tool, detail); res.json({ reply, tool, detail, simulated: true, taskCount: db.prepare('SELECT COUNT(*) AS n FROM tasks').get() });
});
app.post('/api/reset-demo', (_req,res) => { db.transaction(() => { db.prepare('DELETE FROM tasks').run(); db.prepare('DELETE FROM notes').run(); db.prepare('DELETE FROM activity').run(); })(); res.json({ok:true}); });
const port = Number(process.env.PORT || 4174);
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(root, 'dist'); app.use(express.static(dist)); app.get('*', (req,res,next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(dist,'index.html')));
}
app.listen(port, () => console.log(`CampusPilot API ready at http://localhost:${port}`));
