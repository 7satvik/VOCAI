import React, { useState, useRef } from 'react';
import { Mic, MicOff, Download, Play, Check, AlertCircle, MessageCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';

const ROLES = {
    'Software Engineer': [
        'Tell me about a challenging bug you fixed recently.',
        'How do you approach learning a new technology?',
        'Describe your experience with version control systems.',
        'What is your preferred development methodology and why?',
        'How do you ensure code quality in your projects?'
    ],
    'Product Manager': [
        'How do you prioritize features in a product roadmap?',
        'Describe a time you had to make a difficult product decision.',
        'How do you gather and incorporate user feedback?',
        'What metrics do you use to measure product success?',
        'How do you handle disagreements between stakeholders?'
    ],
    'Data Analyst': [
        'Describe your approach to cleaning messy data.',
        'What data visualization tools are you proficient in?',
        'How do you communicate technical findings to non-technical stakeholders?',
        'Tell me about a time data led you to an unexpected insight.',
        'How do you ensure data accuracy in your analysis?'
    ]
};

const FILLER_WORDS = ['uh', 'um', 'like', 'you know', 'basically', 'actually', 'so'];

export default function App() {
    const [apiKey] = useState(import.meta.env.VITE_GROQ_API_KEY);
    const [selectedRole, setSelectedRole] = useState('');
    const [stage, setStage] = useState('setup');
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [answers, setAnswers] = useState([]);
    const [fillerCount, setFillerCount] = useState(0);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [debugLog, setDebugLog] = useState([]);
    const [showDebug, setShowDebug] = useState(false);
    const [difficulty, setDifficulty] = useState('Mid');

    // Cross-question state
    const [followUpQuestion, setFollowUpQuestion] = useState('');
    const [isFollowUp, setIsFollowUp] = useState(false);
    const [followUpCount, setFollowUpCount] = useState(0);

    // Speech pace tracking
    const [currentWpm, setCurrentWpm] = useState(0);
    const startTimeRef = useRef(null);

    const recognitionRef = useRef(null);

    const addLog = (message) => {
        console.log(message);
        setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    };

    const countFillers = (text) => {
        return FILLER_WORDS.reduce((count, word) => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            return count + (text.match(regex) || []).length;
        }, 0);
    };

    const startInterview = () => {
        if (!selectedRole) {
            alert('Please select a role first');
            return;
        }
        setStage('interview');
        setCurrentQuestion(0);
        setAnswers([]);
        setDebugLog([]);
        setFollowUpCount(0);
    };

    const startRecording = () => {
        addLog('Starting recording...');

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert('Speech recognition not supported. Please use Chrome.');
            addLog('ERROR: Speech recognition not supported');
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                addLog('Recording started');
                setIsRecording(true);
                startTimeRef.current = Date.now();
            };

            recognition.onerror = (event) => {
                addLog(`Error: ${event.error}`);
                if (event.error === 'not-allowed') {
                    alert('Microphone access denied. Please allow microphone access.');
                }
                setIsRecording(false);
            };

            recognition.onend = () => {
                addLog('Recording ended');
                setIsRecording(false);
            };

            recognition.onresult = (event) => {
                let fullTranscript = '';
                for (let i = 0; i < event.results.length; i++) {
                    fullTranscript += event.results[i][0].transcript + ' ';
                }
                setTranscript(fullTranscript.trim());
                setFillerCount(countFillers(fullTranscript));
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch (error) {
            addLog(`Exception: ${error.message}`);
            alert(`Failed to start: ${error.message}`);
        }
    };

    const stopRecording = async () => {
        addLog('Stopping recording...');

        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setIsRecording(false);

            if (transcript.trim()) {
                // Calculate WPM
                const durationSec = (Date.now() - startTimeRef.current) / 1000;
                const words = transcript.trim().split(/\s+/).length;
                const wpm = durationSec > 0 ? Math.round((words / durationSec) * 60) : 0;
                setCurrentWpm(wpm);
                addLog(`Speaking pace: ${wpm} WPM`);

                const currentQ = isFollowUp ? followUpQuestion : ROLES[selectedRole][currentQuestion];
                await evaluateAnswer(transcript, currentQ, wpm);
            } else {
                alert('No speech detected. Please try again.');
            }
        }
    };

    const getPaceFeedback = (wpm) => {
        if (wpm < 80) return { text: 'Too slow — sounds hesitant', type: 'warning', icon: '🐢' };
        if (wpm < 100) return { text: 'Slightly slow — could be more confident', type: 'warning', icon: '⚠️' };
        if (wpm <= 140) return { text: 'Ideal speaking pace', type: 'success', icon: '✅' };
        if (wpm <= 160) return { text: 'Slightly fast — slow down a bit', type: 'warning', icon: '⚠️' };
        return { text: 'Too fast — sounds nervous', type: 'error', icon: '⚡' };
    };

    // Communication pattern detection
    const detectPattern = (text) => {
        if (/example|story|situation|experience|when I|one time/i.test(text))
            return { label: 'Story-driven', icon: '🗣️' };
        if (/step|framework|process|approach|first|second|third|then/i.test(text))
            return { label: 'Structured Thinker', icon: '🧩' };
        if (/tool|technology|implemented|stack|built|used|platform/i.test(text))
            return { label: 'Technical Explainer', icon: '🛠️' };
        return { label: 'Rambling Risk', icon: '⚠️' };
    };

    const evaluateAnswer = async (answer, question, wpm) => {
        setIsEvaluating(true);
        addLog('Evaluating with Groq API...');

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{
                        role: 'user',
                        content: `You are ${difficulty === 'Junior' ? 'a very supportive and encouraging' : difficulty === 'Senior' ? 'a strict and demanding' : 'a balanced and helpful'} interview coach conducting a ${selectedRole} mock interview for a ${difficulty}-level candidate. ${difficulty === 'Junior' ? 'Be VERY generous with scoring - focus on building confidence.' : difficulty === 'Senior' ? 'Be strict with scoring - hold them to high standards.' : 'Be fair but encouraging with scoring.'} Respond ONLY with valid JSON (no markdown, no code blocks).

Interview Difficulty: ${difficulty}
Question: "${question}"
Answer: "${answer}"

SCORING GUIDELINES FOR ${difficulty.toUpperCase()} LEVEL:
${difficulty === 'Junior' ? `- Be very encouraging - this is a beginner practicing
- Score generously: 5-6 is average, 7+ for decent answers
- Focus heavily on strengths, minimize criticism
- Frame all feedback positively` : difficulty === 'Senior' ? `- Be strict - senior candidates need honest feedback
- Score realistically: 3-4 is average, 5+ for good answers
- Point out gaps and areas needing improvement
- Expect detailed, structured answers` : `- Be balanced but supportive
- Score fairly: 4-5 is average, 6+ for good answers
- Acknowledge strengths, suggest improvements
- Give constructive feedback`}

Provide feedback in this JSON structure:
{
  "scores": {
    "relevance": <3-10, score based on how directly the answer addresses the question>,
    "clarity": <3-10, vary based on how clear and articulate the response was>,
    "confidence": <3-10, vary based on assertiveness and conviction in delivery>,
    "completeness": <3-10, score lower if important aspects were missed>,
    "technicalAccuracy": <3-10, strict scoring for technical correctness>,
    "communication": <3-10, vary based on structure and flow>
  },
  "overallScore": <3-10, calculate realistically - NOT all scores should be the same>,
  "detailedFeedback": "<Start with what was good. 2-3 sentences of constructive feedback>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "improvements": ["<specific improvement 1>", "<specific improvement 2>"],
  "exampleBetterAnswer": "<A helpful example showing one way to expand the answer>",
  "followUpQuestion": "<A friendly follow-up question to help them elaborate>",
  "shouldAskFollowUp": <true only if answer was very brief, otherwise false>
}

IMPORTANT: Each score category should reflect the ACTUAL quality of that specific aspect. Do NOT give the same score for all categories - evaluate each independently. Scores should vary between questions based on actual performance.`
                    }],
                    temperature: 0.7,
                    max_tokens: 1500
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message || 'API error');
            }

            const text = data.choices?.[0]?.message?.content || '';
            const cleanText = text.replace(/```json|```/g, '').trim();
            const evalData = JSON.parse(cleanText);

            // Detect communication pattern from both answer and feedback
            const pattern = detectPattern(answer + ' ' + (evalData.detailedFeedback || ''));

            const answerData = {
                question,
                answer,
                fillerCount,
                wpm,
                pattern,
                evaluation: evalData,
                isFollowUp
            };

            setAnswers(prev => [...prev, answerData]);
            addLog('Evaluation complete');

            // Check if we should ask a follow-up question (skip for high-quality answers)
            const isHighQuality = evalData.overallScore >= 7;
            if (evalData.shouldAskFollowUp && followUpCount < 1 && !isFollowUp && !isHighQuality) {
                setFollowUpQuestion(evalData.followUpQuestion);
                setIsFollowUp(true);
                setFollowUpCount(prev => prev + 1);
                setTranscript('');
                setFillerCount(0);
            } else {
                // Move to next main question
                setIsFollowUp(false);
                setFollowUpQuestion('');
                if (currentQuestion < ROLES[selectedRole].length - 1) {
                    setCurrentQuestion(prev => prev + 1);
                    setTranscript('');
                    setFillerCount(0);
                    setFollowUpCount(0);
                } else {
                    setStage('complete');
                }
            }
        } catch (error) {
            addLog(`Error: ${error.message}`);
            alert(`Evaluation failed: ${error.message}`);
        } finally {
            setIsEvaluating(false);
        }
    };

    const skipFollowUp = () => {
        setIsFollowUp(false);
        setFollowUpQuestion('');
        if (currentQuestion < ROLES[selectedRole].length - 1) {
            setCurrentQuestion(prev => prev + 1);
            setTranscript('');
            setFillerCount(0);
            setFollowUpCount(0);
        } else {
            setStage('complete');
        }
    };

    // Discard and restart current question
    const redoQuestion = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        setIsRecording(false);
        setTranscript('');
        setFillerCount(0);
        setCurrentWpm(0);
        setRecordingStartTime(null);
        addLog('Question restarted - discarded previous attempt');
    };

    const generatePDF = () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const lineHeight = 7;
        let y = margin;

        const addText = (text, x, fontSize = 10, style = 'normal') => {
            doc.setFontSize(fontSize);
            doc.setFont('helvetica', style);
            const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - (x - margin));
            lines.forEach(line => {
                if (y > 270) {
                    doc.addPage();
                    y = margin;
                }
                doc.text(line, x, y);
                y += lineHeight;
            });
        };

        const addSection = (title) => {
            y += 5;
            doc.setDrawColor(100);
            doc.line(margin, y, pageWidth - margin, y);
            y += 8;
            addText(title, margin, 14, 'bold');
            y += 3;
        };

        // Header
        doc.setFillColor(30, 30, 30);
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('VOCAI Interview Report', margin, 25);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${selectedRole} | ${new Date().toLocaleDateString()}`, margin, 35);

        doc.setTextColor(0, 0, 0);
        y = 55;

        // Summary Stats
        const mainAnswers = answers.filter(a => !a.isFollowUp);
        const totalFillers = answers.reduce((sum, a) => sum + a.fillerCount, 0);
        const avgOverall = (answers.reduce((sum, a) => sum + (a.evaluation.overallScore || 7), 0) / answers.length).toFixed(1);
        const avgClarity = (answers.reduce((sum, a) => sum + (a.evaluation.scores?.clarity || a.evaluation.clarity || 7), 0) / answers.length).toFixed(1);
        const avgConfidence = (answers.reduce((sum, a) => sum + (a.evaluation.scores?.confidence || a.evaluation.confidence || 7), 0) / answers.length).toFixed(1);

        addText('PERFORMANCE SUMMARY', margin, 14, 'bold');
        y += 5;

        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y - 5, pageWidth - margin * 2, 30, 'F');

        const statWidth = (pageWidth - margin * 2) / 4;
        const statsY = y;

        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(avgOverall, margin + statWidth * 0.5, statsY + 10, { align: 'center' });
        doc.text(avgClarity, margin + statWidth * 1.5, statsY + 10, { align: 'center' });
        doc.text(avgConfidence, margin + statWidth * 2.5, statsY + 10, { align: 'center' });
        doc.text(String(totalFillers), margin + statWidth * 3.5, statsY + 10, { align: 'center' });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Overall', margin + statWidth * 0.5, statsY + 18, { align: 'center' });
        doc.text('Clarity', margin + statWidth * 1.5, statsY + 18, { align: 'center' });
        doc.text('Confidence', margin + statWidth * 2.5, statsY + 18, { align: 'center' });
        doc.text('Filler Words', margin + statWidth * 3.5, statsY + 18, { align: 'center' });

        y = statsY + 35;

        // Detailed Answers
        answers.forEach((answer, idx) => {
            addSection(`${answer.isFollowUp ? '↳ Follow-up' : `Question ${mainAnswers.indexOf(answer) + 1}`}`);

            doc.setTextColor(60, 60, 60);
            addText(`Q: ${answer.question}`, margin, 11, 'bold');
            y += 2;

            doc.setTextColor(0, 0, 0);
            addText(`A: ${answer.answer}`, margin, 10);
            y += 3;

            // Scores
            const scores = answer.evaluation.scores || answer.evaluation;
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, y - 3, pageWidth - margin * 2, 12, 'F');
            doc.setFontSize(9);
            const scoreText = `Relevance: ${scores.relevance || 'N/A'}/10 | Clarity: ${scores.clarity}/10 | Confidence: ${scores.confidence}/10 | Fillers: ${answer.fillerCount}`;
            doc.text(scoreText, margin + 5, y + 4);
            y += 15;

            // Detailed Feedback
            if (answer.evaluation.detailedFeedback) {
                addText('Feedback:', margin, 10, 'bold');
                addText(answer.evaluation.detailedFeedback, margin + 5, 10);
                y += 3;
            }

            // Strengths
            if (answer.evaluation.strengths?.length) {
                addText('Strengths:', margin, 10, 'bold');
                answer.evaluation.strengths.forEach(s => {
                    addText(`• ${s}`, margin + 5, 10);
                });
                y += 3;
            }

            // Improvements
            if (answer.evaluation.improvements?.length) {
                addText('Areas to Improve:', margin, 10, 'bold');
                answer.evaluation.improvements.forEach(i => {
                    addText(`• ${i}`, margin + 5, 10);
                });
                y += 3;
            }

            // Example Better Answer
            if (answer.evaluation.exampleBetterAnswer) {
                addText('Example Better Answer:', margin, 10, 'bold');
                doc.setTextColor(60, 100, 60);
                addText(answer.evaluation.exampleBetterAnswer, margin + 5, 10, 'italic');
                doc.setTextColor(0, 0, 0);
            }

            y += 5;
        });

        // Save
        doc.save(`VOCAI-Report-${selectedRole.replace(/\s+/g, '-')}-${Date.now()}.pdf`);
    };

    const questions = selectedRole ? ROLES[selectedRole] : [];
    const progress = questions.length ? (currentQuestion / questions.length) * 100 : 0;
    const currentQ = isFollowUp ? followUpQuestion : (questions[currentQuestion] || '');

    // Skill Trend Intelligence - compute trends
    const skillTrends = answers
        .filter(a => !a.isFollowUp)
        .map((a, i, arr) => {
            if (i === 0) return null;
            const prev = arr[i - 1].evaluation.scores;
            const curr = a.evaluation.scores;
            return {
                questionIndex: i + 1,
                clarityDelta: curr.clarity - prev.clarity,
                confidenceDelta: curr.confidence - prev.confidence
            };
        })
        .filter(Boolean);

    const interpretTrend = (delta, skill) => {
        if (delta >= 3) return { text: `${skill} jumped (+${delta})`, icon: '⬆️', type: 'positive' };
        if (delta === 2) return { text: `${skill} improved (+2)`, icon: '⬆️', type: 'positive' };
        if (delta === 1) return { text: `${skill} up slightly (+1)`, icon: '🟢', type: 'positive' };
        if (delta === 0) return { text: `${skill} held steady`, icon: '➖', type: 'neutral' };
        if (delta === -1) return { text: `${skill} dipped (-1)`, icon: '🟠', type: 'warning' };
        if (delta === -2) return { text: `${skill} dropped (-2)`, icon: '⬇️', type: 'warning' };
        return { text: `${skill} fell sharply (${delta})`, icon: '⬇️', type: 'negative' };
    };

    return (
        <div className="app">
            <header className="header">
                <h1>VOCAI</h1>
                <p>AI-powered mock interview practice</p>
            </header>

            {stage === 'setup' && (
                <div className="card">
                    <div className="role-grid">
                        {Object.keys(ROLES).map(role => (
                            <button
                                key={role}
                                onClick={() => setSelectedRole(role)}
                                className={`role-btn ${selectedRole === role ? 'selected' : ''}`}
                            >
                                <span className="role-name">{role}</span>
                                <span className="role-count">{ROLES[role].length} questions</span>
                            </button>
                        ))}
                    </div>

                    <div className="difficulty-section">
                        <div className="difficulty-label">Interview Difficulty</div>
                        <div className="difficulty-toggle">
                            {['Junior', 'Mid', 'Senior'].map(level => (
                                <button
                                    key={level}
                                    onClick={() => setDifficulty(level)}
                                    className={`difficulty-btn ${difficulty === level ? 'active' : ''}`}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                        <p className="difficulty-hint">
                            {difficulty === 'Junior' && 'Encouraging feedback, generous scoring'}
                            {difficulty === 'Mid' && 'Balanced feedback, fair scoring'}
                            {difficulty === 'Senior' && 'Strict feedback, demanding standards'}
                        </p>
                    </div>

                    <button
                        onClick={startInterview}
                        disabled={!selectedRole}
                        className="btn btn-primary"
                    >
                        <Play size={18} />
                        Start Interview
                    </button>

                    <div className="notice">
                        <div className="notice-title">Features</div>
                        <ul className="notice-list">
                            <li>Detailed AI feedback with scores</li>
                            <li>Cross-questioning on vague answers</li>
                            <li>PDF report with improvement tips</li>
                        </ul>
                    </div>
                </div>
            )}

            {stage === 'interview' && (
                <>
                    <div className="progress-bar">
                        <div className="progress-info">
                            <span>Question {currentQuestion + 1} of {questions.length}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>

                    <div className="card">
                        {isFollowUp && (
                            <div className="followup-badge">
                                <MessageCircle size={14} />
                                <span>Follow-up Question</span>
                            </div>
                        )}

                        <div className="question-label">
                            {isFollowUp ? 'Follow-up' : `Question ${currentQuestion + 1}`}
                        </div>
                        <h2 className="question-text">{currentQ}</h2>

                        <div className="record-section">
                            {!isRecording && !isEvaluating && (
                                <>
                                    <button onClick={startRecording} className="btn btn-record">
                                        <Mic size={20} />
                                        Start Recording
                                    </button>
                                    <p className="record-hint">Click and speak your answer</p>
                                    {isFollowUp && (
                                        <button onClick={skipFollowUp} className="btn btn-secondary" style={{ marginTop: '10px' }}>
                                            Skip Follow-up
                                        </button>
                                    )}
                                </>
                            )}

                            {isRecording && (
                                <>
                                    <div className="record-status">
                                        <span className="record-dot" />
                                        <span>Recording...</span>
                                    </div>
                                    <div className="record-buttons">
                                        <button onClick={stopRecording} className="btn btn-record recording">
                                            <MicOff size={20} />
                                            Stop & Submit
                                        </button>
                                        <button onClick={redoQuestion} className="btn btn-redo">
                                            Discard & Restart
                                        </button>
                                    </div>
                                </>
                            )}

                            {isEvaluating && (
                                <div className="loading">
                                    <div className="spinner" />
                                    <p className="loading-text">Analyzing your answer...</p>
                                </div>
                            )}
                        </div>

                        {transcript && (
                            <div className="transcript">
                                <div className="transcript-label">Your answer</div>
                                <p className="transcript-text">{transcript}</p>
                                <div className="transcript-stats">
                                    {currentWpm > 0 && (() => {
                                        const pace = getPaceFeedback(currentWpm);
                                        return (
                                            <div className={`pace-indicator pace-${pace.type}`}>
                                                <span className="pace-wpm">🗣️ {currentWpm} WPM</span>
                                                <span className="pace-feedback">{pace.icon} {pace.text}</span>
                                            </div>
                                        );
                                    })()}
                                    {fillerCount > 0 && (
                                        <div className="filler-count">
                                            <AlertCircle size={14} />
                                            <span>{fillerCount} filler word{fillerCount !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}
                                </div>
                                <button onClick={redoQuestion} className="btn btn-redo" style={{ marginTop: '1rem' }}>
                                    Discard & Restart
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {stage === 'complete' && (
                <div className="card">
                    <div className="brand-tagline">
                        <span className="tagline-highlight">VOCAI doesn't grade answers.</span>
                        <span className="tagline-sub">It diagnoses interview thinking.</span>
                    </div>

                    <div className="complete-header">
                        <Check size={48} className="complete-icon" />
                        <h2>Interview Complete</h2>
                        <p>Download your detailed PDF report</p>
                    </div>

                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-value">{answers.filter(a => !a.isFollowUp).length}</div>
                            <div className="stat-label">Questions</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{answers.filter(a => a.isFollowUp).length}</div>
                            <div className="stat-label">Follow-ups</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {(answers.reduce((sum, a) => sum + (a.evaluation.overallScore || 7), 0) / answers.length).toFixed(1)}
                            </div>
                            <div className="stat-label">Avg Score</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">
                                {answers.reduce((sum, a) => sum + a.fillerCount, 0)}
                            </div>
                            <div className="stat-label">Fillers</div>
                        </div>
                    </div>

                    {/* Score Progression Chart */}
                    {answers.filter(a => !a.isFollowUp).length > 1 && (() => {
                        const mainAnswers = answers.filter(a => !a.isFollowUp);
                        const spacing = 300 / Math.max(mainAnswers.length - 1, 1);
                        const points = mainAnswers.map((a, i) => {
                            const score = a.evaluation.overallScore || 5;
                            return `${60 + i * spacing},${95 - score * 7}`;
                        }).join(' ');
                        const areaPoints = `60,95 ${points} ${60 + (mainAnswers.length - 1) * spacing},95`;

                        return (
                            <div className="chart-section">
                                <h3 className="chart-title">Score Progression</h3>
                                <div className="chart-container">
                                    <svg width="100%" height="160" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid meet">
                                        <defs>
                                            <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                <stop offset="0%" stopColor="#f04e23" stopOpacity="0.3" />
                                                <stop offset="100%" stopColor="#f04e23" stopOpacity="0.05" />
                                            </linearGradient>
                                        </defs>

                                        {/* Y-axis labels */}
                                        <text x="20" y="30" className="chart-label">10</text>
                                        <text x="20" y="62" className="chart-label">5</text>
                                        <text x="20" y="98" className="chart-label">0</text>

                                        {/* Grid lines */}
                                        <line x1="45" y1="25" x2="375" y2="25" className="chart-grid" />
                                        <line x1="45" y1="60" x2="375" y2="60" className="chart-grid chart-grid-dashed" />
                                        <line x1="45" y1="95" x2="375" y2="95" className="chart-grid" />

                                        {/* Area fill under the line */}
                                        <polygon
                                            points={areaPoints}
                                            fill="url(#chartGradient)"
                                            className="chart-area"
                                        />

                                        {/* Animated line */}
                                        <polyline
                                            points={points}
                                            fill="none"
                                            stroke="#f04e23"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="chart-line"
                                        />

                                        {/* Data points with animations */}
                                        {mainAnswers.map((a, i) => {
                                            const score = a.evaluation.overallScore || 5;
                                            const x = 60 + i * spacing;
                                            const y = 95 - score * 7;
                                            return (
                                                <g key={i} className="chart-point-group" style={{ animationDelay: `${i * 0.15 + 0.5}s` }}>
                                                    {/* Outer glow */}
                                                    <circle
                                                        cx={x}
                                                        cy={y}
                                                        r="12"
                                                        fill="#f04e23"
                                                        opacity="0.15"
                                                        className="chart-point-glow"
                                                    />
                                                    {/* Main point */}
                                                    <circle
                                                        cx={x}
                                                        cy={y}
                                                        r="6"
                                                        fill="#f04e23"
                                                        className="chart-point"
                                                    />
                                                    {/* Inner dot */}
                                                    <circle
                                                        cx={x}
                                                        cy={y}
                                                        r="2.5"
                                                        fill="white"
                                                    />
                                                    {/* Score label */}
                                                    <text
                                                        x={x}
                                                        y={y - 16}
                                                        textAnchor="middle"
                                                        className="chart-score"
                                                    >
                                                        {score}
                                                    </text>
                                                    {/* X-axis label */}
                                                    <text
                                                        x={x}
                                                        y={130}
                                                        textAnchor="middle"
                                                        className="chart-label"
                                                    >
                                                        Q{i + 1}
                                                    </text>
                                                </g>
                                            );
                                        })}
                                    </svg>
                                </div>
                            </div>
                        );
                    })()}

                    {skillTrends.length > 0 && (
                        <div className="trend-section">
                            <h3 className="trend-title">📈 Skill Trajectory</h3>
                            <p className="trend-subtitle">How your performance evolved during the interview</p>
                            <div className="trend-list">
                                {skillTrends.map(t => {
                                    const clarity = interpretTrend(t.clarityDelta, 'Clarity');
                                    const confidence = interpretTrend(t.confidenceDelta, 'Confidence');
                                    return (
                                        <div key={t.questionIndex} className="trend-item">
                                            <div className="trend-question">Q{t.questionIndex - 1} → Q{t.questionIndex}</div>
                                            <div className="trend-metrics">
                                                <span className={`trend-badge trend-${clarity.type}`}>
                                                    {clarity.icon} {clarity.text}
                                                </span>
                                                <span className={`trend-badge trend-${confidence.type}`}>
                                                    {confidence.icon} {confidence.text}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="btn-group">
                        <button onClick={generatePDF} className="btn btn-primary">
                            <Download size={18} />
                            Download PDF Report
                        </button>
                        <button
                            onClick={() => {
                                setStage('setup');
                                setSelectedRole('');
                                setAnswers([]);
                                setTranscript('');
                                setFollowUpQuestion('');
                                setIsFollowUp(false);
                            }}
                            className="btn btn-secondary"
                        >
                            New Interview
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
