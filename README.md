# Student Budget Planner


A simple web app for college students to plan student loan payback and get budgeting recommendations.

## Features
- Student loan payback planner (monthly payment, total interest)
- Budget recommendations with suggested percentages and playful tips
- Bank connect UI placeholder (integration not implemented)
 - Save and load plans locally (persisted to `data/plans.json`)
 - Interactive budget chart (doughnut) on the Budget page
 - Small UI animations and professional copy to improve usability

## Run locally

1. Install dependencies

```bash
npm install
```

2. Start server

```bash
npm start
```

3. Open http://localhost:3000 in your browser

Additional endpoints:

- `POST /api/save-plan` — save a plan (body: JSON plan)
- `GET /api/plans` — list saved plans

## Notes
- Bank connection is a placeholder endpoint (`/api/connect-bank`). Add OAuth or Plaid later.

## Budget Buddy (Chatbot)

This project supports an integrated AI assistant called **Budget Buddy**. To turn it on, set your chat‑service key as an environment variable before starting the server. For example:

```bash
export OPENAI_API_KEY="sk-..."  # Linux / macOS
# or in PowerShell:
$env:OPENAI_API_KEY = "sk-..."
```

With the variable in place, Budget Buddy will be reachable at `/ai.html` and the `/api/ai-chat` endpoint will relay messages to the external service. Keep the key out of your source code by using environment variables or a secret manager.

When the variable is missing or the service is unreachable, the app falls back to a built-in demo mode that still provides helpful advice about money. The model is designed to know a lot about personal finance, budgeting, student loans, savings, investing basics and other economic topics, but it will always limit itself to financial matters. The demo understands simple greetings, questions and keywords (like “budget”, “loan”, or “save”) and will steer the conversation back to money-related topics if you say something unrelated.
