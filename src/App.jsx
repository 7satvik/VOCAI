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
    const [apiKey, setApiKey] = useState('');
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

    // Cross-question state
    const [followUpQuestion, setFollowUpQuestion] = useState('');
    const [isFollowUp, setIsFollowUp] = useState(false);
    const [followUpCount, setFollowUpCount] = useState(0);

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
        if (!apiKey.trim()) {
            alert('Please enter your Groq API key');
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
                const currentQ = isFollowUp ? followUpQuestion : ROLES[selectedRole][currentQuestion];
                await evaluateAnswer(transcript, currentQ);
            } else {
                alert('No speech detected. Please try again.');
            }
        }
    };

    const evaluateAnswer = async (answer, question) => {
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
                        content: `You are an expert interview coach conducting a ${selectedRole} interview. Provide a DETAILED evaluation of this answer. Respond ONLY with valid JSON (no markdown, no code blocks).

Question: "${question}"
Answer: "${answer}"

Provide comprehensive feedback in this JSON structure:
{
  "scores": {
    "relevance": <1-10>,
    "clarity": <1-10>,
    "confidence": <1-10>,
    "completeness": <1-10>,
    "technicalAccuracy": <1-10>,
    "communication": <1-10>
  },
  "overallScore": <1-10>,
  "detailedFeedback": "<3-4 sentences of specific, actionable feedback about the answer quality, what was good, and what could be improved>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "improvements": ["<specific improvement 1>", "<specific improvement 2>", "<specific improvement 3>"],
  "exampleBetterAnswer": "<A 2-3 sentence example of how they could have answered better>",
  "followUpQuestion": "<A probing follow-up question based on their answer to dig deeper>",
  "shouldAskFollowUp": <true if the answer was vague or incomplete, false if comprehensive>
}`
                    }],
                    temperature: 0.4,
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

            const answerData = {
                question,
                answer,
                fillerCount,
                evaluation: evalData,
                isFollowUp
            };

            setAnswers(prev => [...prev, answerData]);
            addLog('Evaluation complete');

            // Check if we should ask a follow-up question
            if (evalData.shouldAskFollowUp && followUpCount < 1 && !isFollowUp) {
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

    return (
        <div className="app">
            <header className="header">
                <h1>VOCAI</h1>
                <p>AI-powered mock interview practice</p>
            </header>

            {stage === 'setup' && (
                <div className="card">
                    <div className="api-input-section">
                        <label className="input-label">Groq API Key</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your API key"
                            className="input-field"
                        />
                        <p className="input-hint">Get your free key from console.groq.com</p>
                    </div>

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

                    <button
                        onClick={startInterview}
                        disabled={!selectedRole || !apiKey.trim()}
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
                                    <button onClick={stopRecording} className="btn btn-record recording">
                                        <MicOff size={20} />
                                        Stop & Submit
                                    </button>
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
                                {fillerCount > 0 && (
                                    <div className="filler-count">
                                        <AlertCircle size={14} />
                                        <span>{fillerCount} filler word{fillerCount !== 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {stage === 'complete' && (
                <div className="card">
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
