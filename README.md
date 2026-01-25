# VOCAI - AI Mock Interview Practice

AI-powered mock interview app with speech recognition, real-time evaluation, and PDF reports.

## Features

- 🎤 **Speech Recognition** - Real-time voice capture
- 🤖 **AI Evaluation** - Detailed feedback using Groq API (Llama 3.3 70B)
- 📊 **6 Metrics** - Relevance, clarity, confidence, completeness, technical accuracy, communication
- 🔄 **Cross-Questioning** - Follow-up questions on vague answers
- 📄 **PDF Reports** - Downloadable performance summary
- 🎯 **Filler Word Detection** - Tracks "uh", "um", "like", etc.

## Roles Available

- Software Engineer (5 questions)
- Product Manager (5 questions)
- Data Analyst (5 questions)

## Getting Started

1. Clone the repo
```bash
git clone https://github.com/7satvik/VOCAI.git
cd VOCAI
```

2. Install dependencies
```bash
npm install
```

3. Run dev server
```bash
npm run dev
```

4. Open http://localhost:5173 in Chrome

## API Key

Get your free Groq API key from [console.groq.com](https://console.groq.com)

## Tech Stack

- React + Vite
- Groq API (Llama 3.3 70B)
- jsPDF
- Web Speech API
- Firebase Hosting

## Live Demo

 https://vocai-22270.web.app

## License

MIT
