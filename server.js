const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const session = require('express-session');
const crypto = require('crypto');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// sessions (simple, for demo only)
app.use(session({
  secret: 'dev-secret-budget-app',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Ensure data directory and plans file exist
const plansDir = path.join(__dirname, 'data');
const plansFile = path.join(plansDir, 'plans.json');
const usersFile = path.join(plansDir, 'users.json');
try {
  fsSync.mkdirSync(plansDir, { recursive: true });
  if (!fsSync.existsSync(plansFile)) fsSync.writeFileSync(plansFile, '[]');
  if (!fsSync.existsSync(usersFile)) fsSync.writeFileSync(usersFile, '[]');
} catch (err) {
  console.error('Failed to prepare data directory:', err);
}

// Loan planner: POST /api/loan-plan
app.post('/api/loan-plan', (req, res) => {
  const { principal, annualRate, years } = req.body;
  const P = Number(principal);
  const r = Number(annualRate) / 100 / 12; // monthly rate
  const n = Number(years) * 12;
  if (!P || !r || !n || n <= 0) return res.status(400).json({ error: 'Invalid input' });

  // Monthly payment formula
  const monthly = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const totalPaid = monthly * n;
  const totalInterest = totalPaid - P;

  res.json({ monthlyPayment: Number(monthly.toFixed(2)), totalPaid: Number(totalPaid.toFixed(2)), totalInterest: Number(totalInterest.toFixed(2)), months: n });
});

// Budget recommendations: POST /api/budget-recommendations
app.post('/api/budget-recommendations', (req, res) => {
  const { monthlyIncome } = req.body;
  const income = Number(monthlyIncome);
  if (!income || income <= 0) return res.status(400).json({ error: 'Invalid income' });

  // Simple recommended percentages (example for students)
  const recommendations = [
    { category: 'Savings / Emergency', pct: 10 },
    { category: 'Student Loan / Debt Repayment', pct: 15 },
    { category: 'Rent / Housing', pct: 30 },
    { category: 'Food / Groceries', pct: 10 },
    { category: 'Transport', pct: 5 },
    { category: 'Utilities / Phone / Internet', pct: 5 },
    { category: 'Leisure / Misc', pct: 15 }
  ];

  // Add some playful "nonsense" advice
  const nonsense = [
    "Try the 24-hour rule before impulse buys.",
    "Pack lunches 3x this month — your future self thanks you.",
    "One latte less per week = ~ $200/year — buy a plant instead."
  ];

  const breakdown = recommendations.map(r => ({ category: r.category, pct: r.pct, amount: Number((income * (r.pct/100)).toFixed(2)) }));

  res.json({ income, breakdown, nonsense });
});

// Bank connect placeholder
app.get('/api/connect-bank', (req, res) => {
  res.json({ status: 'not_implemented', message: 'Bank connection UI is present but actual bank linking is not implemented yet. You can add OAuth or Plaid integration later.' });
});

// Save a plan (loan or budget) to local JSON storage
app.post('/api/save-plan', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  try {
    const plan = req.body || {};
    const raw = await fs.readFile(plansFile, 'utf8');
    const list = JSON.parse(raw || '[]');
    const entry = Object.assign({ id: Date.now(), createdAt: new Date().toISOString(), userId: req.session.user.id }, plan);
    list.push(entry);
    await fs.writeFile(plansFile, JSON.stringify(list, null, 2));
    res.json({ ok: true, plan: entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to save plan' });
  }
});

// Get saved plans
app.get('/api/plans', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'not authenticated' });
  try {
    const raw = await fs.readFile(plansFile, 'utf8');
    const list = JSON.parse(raw || '[]');
    const filtered = list.filter(p => p.userId === req.session.user.id);
    res.json(filtered.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read plans' });
  }
});

// Delete a saved plan by id
app.delete('/api/plan/:id', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ ok: false, error: 'not authenticated' });
  try {
    const id = parseInt(req.params.id);
    const raw = await fs.readFile(plansFile, 'utf8');
    let list = JSON.parse(raw || '[]');
    const before = list.length;
    list = list.filter(p => p.id !== id);
    if (list.length === before) return res.status(404).json({ ok: false, error: 'Plan not found' });
    await fs.writeFile(plansFile, JSON.stringify(list, null, 2));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Failed to delete plan' });
  }
});

// --- Authentication endpoints (username + password, no email) ---
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(String(pwd)).digest('hex');
}

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    const users = JSON.parse(raw || '[]');
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'username taken' });
    }
    const user = { id: Date.now(), username, passwordHash: hashPwd(password), createdAt: new Date().toISOString() };
    users.push(user);
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    // set session
    req.session.user = { id: user.id, username: user.username };
    res.json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to register' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    const users = JSON.parse(raw || '[]');
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    if (user.passwordHash !== hashPwd(password)) return res.status(401).json({ error: 'invalid credentials' });
    req.session.user = { id: user.id, username: user.username };
    res.json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to login' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) return res.json({ user: req.session.user });
  res.json({ user: null });
});

// Profile endpoints - require session
app.get('/api/profile', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'not authenticated' });
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    const users = JSON.parse(raw || '[]');
    const user = users.find(u => u.id === req.session.user.id);
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json({ profile: user.profile || {} , username: user.username, createdAt: user.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load profile' });
  }
});

app.post('/api/profile', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'not authenticated' });
  const profile = req.body || {};
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    const users = JSON.parse(raw || '[]');
    const idx = users.findIndex(u => u.id === req.session.user.id);
    if (idx === -1) return res.status(404).json({ error: 'user not found' });
    users[idx].profile = profile;
    // allow updating display username from profile.fullName? keep username separate
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    res.json({ ok: true, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to save profile' });
  }
});

// Delete account endpoint (removes user) - requires session
app.post('/api/delete-account', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'not authenticated' });
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    let users = JSON.parse(raw || '[]');
    users = users.filter(u => u.id !== req.session.user.id);
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
    req.session.destroy(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete account' });
  }
});

// AI Chat endpoint (Budget Buddy) - forwards to OpenAI Chat API.
// Requires env var OPENAI_API_KEY to be set. Expects { messages: [{role:'user', content:'...'}] }
app.post('/api/ai-chat', async (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on the server. Set environment variable OPENAI_API_KEY.' });
  const body = req.body || {};
  const userMessages = body.messages || [];

  // Add a system prompt so Budget Buddy acts as a budgeting expert with wide financial knowledge.
  // The prompt should not reference any internal APIs or keys; it simply defines the assistant's persona and behavior.
  const systemPrompt = `You are Budget Buddy, a diligent and personable financial expert for college students. You possess broad knowledge of personal finance, budgeting, student loans, banking, credit, investing basics, economics, and related money matters. Your sole purpose is to help users plan, save, and manage money with detailed, step-by-step advice. Provide concrete examples, friendly encouragement, and multiple practical options when possible. Mention student loans, emergency funds, spending trackers, and budgeting rules (like 50/30/20) where relevant. If a user asks about topics outside of finance or money, politely state that you are limited to financial topics and steer the conversation back to budgeting or money management. Always include a gentle reminder that you are not a licensed financial advisor when giving guidance, but avoid technical details about how you are powered or keys. Keep responses focused on financial matters and approachable for someone new to budgeting.`;

  try {
    const payload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...userMessages],
      max_tokens: 800,
      temperature: 0.7
    };
    // Use Node's https to avoid relying on a global fetch implementation
    const callOpenAI = (pl, apiKey) => new Promise((resolve, reject) => {
      const postData = JSON.stringify(pl);
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${apiKey}`
        }
      };
      const rreq = https.request(options, (rres) => {
        let raw = '';
        rres.on('data', (c) => raw += c);
        rres.on('end', () => {
          try {
            const parsed = JSON.parse(raw || '{}');
            if (rres.statusCode >= 200 && rres.statusCode < 300) return resolve(parsed);
            return reject({ status: rres.statusCode, body: parsed });
          } catch (e) {
            return reject({ status: rres.statusCode, body: raw });
          }
        });
      });
      rreq.on('error', (e) => reject(e));
      rreq.write(postData);
      rreq.end();
    });

    const data = await callOpenAI(payload, key);
    if (!data || !data.choices) return res.status(500).json({ error: 'AI provider returned unexpected response', details: data });
    const reply = data.choices[0] && data.choices[0].message ? data.choices[0].message.content : (data.choices[0] && data.choices[0].text) || '';
    res.json({ reply });
  } catch (err) {
    console.error('AI chat error', err);
    
    // Fallback: provide a demo response when the API is unavailable
    // This allows the feature to work for demonstration purposes
    const demoResponses = {
      greeting: "Hi there! I'm Budget Buddy, your budgeting assistant. Ask me anything about loans, spending, or saving and I'll do my best to help.",
      budget: "Here are some budgeting tips: (1) Use the 50/30/20 rule — 50% needs, 30% wants, 20% savings; (2) Track every expense for a month to see where your money goes; (3) Set up automatic transfers to savings right after payday. As a college student, focus on keeping debt low and building an emergency fund!",
      loan: "Student loan advice: (1) Start with federal loans before private; (2) Make extra payments when possible to reduce interest; (3) Consider income-driven repayment plans if needed; (4) Check if you qualify for forgiveness programs. The earlier you pay, the less interest you'll pay overall!",
      save: "Saving strategies: (1) Automate your savings — set it and forget it; (2) Start small if needed, even $25/month adds up; (3) Use a high-yield savings account; (4) Treat savings like a bill you must pay. Small consistent deposits are better than sporadic large ones!",
      default: "I'm here to help with your budgeting and finance questions. Ask me about a budget, loans, savings, investing basics, or other money matters—or just say hi to get started!"
    };
    
    // Try to match the user's question to a suitable demo response
    const userText = (userMessages && userMessages[0] && userMessages[0].content) || '';
    let reply;
    const txt = userText.toLowerCase();
    const greetRegex = /\b(hi|hello|hey|good morning|good afternoon|good evening)\b/;
    const questionRegex = /\b(how|what|why|when|where|can|should|is|are)\b/;

    // prioritize keywords over greetings so "hi, I need help saving" still triggers save advice
    if (txt.includes('budget')) {
      reply = demoResponses.budget;
    } else if (txt.includes('loan') || txt.includes('debt')) {
      reply = demoResponses.loan;
    } else if (txt.includes('sav')) {
      reply = demoResponses.save;
    } else if (greetRegex.test(txt)) {
      reply = demoResponses.greeting;
    } else if (questionRegex.test(txt) || txt.trim().endsWith('?')) {
      reply = "That's an interesting question! I'm a budgeting assistant who can talk about budgets, student loans, and savings goals. Try phrasing a question like 'How do I start a budget?' or 'What should I save for?' and I'll give you some tips.";
    } else {
      // fallback generic guidance for off-topic input
      reply = "I'm here to discuss financial topics only (budgets, loans, savings, investments, etc.). I can help you think about money or suggest budgeting strategies—feel free to ask a related question!";
    }

    res.json({ reply, demo: true });
  }
});

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

