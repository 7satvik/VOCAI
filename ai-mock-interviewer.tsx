import React, { useState, useRef } from 'react';
import { Mic, MicOff, Download, PlayCircle, CheckCircle, AlertCircle } from 'lucide-react';

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

export default function AIInterviewer() {
  const [selectedRole, setSelectedRole] = useState('');
  const [stage, setStage] = useState('setup');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [answers, setAnswers] = useState([]);
  const [fillerCount, setFillerCount] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const recognitionRef = useRef(null);

  const addLog = (message) => {
    console.log(message);
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const countFillers = (text) => {
    const fillers = FILLER_WORDS.reduce((count, word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      return count + (text.match(regex) || []).length;
    }, 0);
    return fillers;
  };

  const startInterview = () => {
    if (!selectedRole) {
      alert('Please select a role first!');
      return;
    }
    setStage('interview');
    setCurrentQuestion(0);
    setAnswers([]);
    setDebugLog([]);
  };

  const startRecording = () => {
    addLog('Start Recording clicked');

    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition not supported. Please use Google Chrome.');
      addLog('ERROR: Speech recognition not supported');
      return;
    }

    try {
      const recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        addLog('✓ Recognition started successfully');
        setIsRecording(true);
      };

      recognition.onerror = (event) => {
        addLog(`ERROR: ${event.error}`);
        if (event.error === 'not-allowed') {
          alert('Microphone permission denied. Please allow microphone access and try again.');
        } else if (event.error === 'no-speech') {
          addLog('No speech detected');
        } else {
          alert(`Microphone error: ${event.error}`);
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        addLog('Recognition ended');
        setIsRecording(false);
      };

      recognition.onresult = (event) => {
        let fullTranscript = '';
        
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }

        addLog(`Heard: ${fullTranscript.substring(0, 50)}...`);
        setTranscript(fullTranscript);
        setFillerCount(countFillers(fullTranscript));
      };

      recognitionRef.current = recognition;
      recognition.start();
      addLog('Attempting to start recognition...');

    } catch (error) {
      addLog(`EXCEPTION: ${error.message}`);
      alert(`Failed to start: ${error.message}`);
    }
  };

  const stopRecording = async () => {
    addLog('Stop Recording clicked');
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setIsRecording(false);
        
        if (transcript.trim()) {
          addLog(`Submitting answer: ${transcript.substring(0, 50)}...`);
          await evaluateAnswer(transcript, ROLES[selectedRole][currentQuestion]);
        } else {
          alert('No speech detected. Please try speaking again.');
          addLog('No transcript to submit');
        }
      } catch (error) {
        addLog(`Error stopping: ${error.message}`);
      }
    }
  };

  const evaluateAnswer = async (answer, question) => {
    setIsEvaluating(true);
    addLog('Evaluating answer...');
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are an expert interview coach. Evaluate this interview answer and respond ONLY with valid JSON (no markdown, no preamble).

Question: "${question}"
Answer: "${answer}"

Respond with this exact JSON structure:
{
  "relevance": <score 1-10>,
  "clarity": <score 1-10>,
  "confidence": <score 1-10>,
  "completeness": <score 1-10>,
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"]
}`
          }]
        })
      });

      const data = await response.json();
      const text = data.content.map(item => item.text || '').join('\n');
      const cleanText = text.replace(/```json|```/g, '').trim();
      const evalData = JSON.parse(cleanText);

      const answerData = {
        question,
        answer,
        fillerCount,
        evaluation: evalData
      };

      setAnswers(prev => [...prev, answerData]);
      addLog('Evaluation complete');
      
      if (currentQuestion < ROLES[selectedRole].length - 1) {
        setCurrentQuestion(prev => prev + 1);
        setTranscript('');
        setFillerCount(0);
      } else {
        setStage('complete');
      }
    } catch (error) {
      addLog(`Evaluation error: ${error.message}`);
      alert('Error evaluating answer. Please try again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  const generateReport = () => {
    const totalFillers = answers.reduce((sum, a) => sum + a.fillerCount, 0);
    const avgRelevance = (answers.reduce((sum, a) => sum + a.evaluation.relevance, 0) / answers.length).toFixed(1);
    const avgClarity = (answers.reduce((sum, a) => sum + a.evaluation.clarity, 0) / answers.length).toFixed(1);
    const avgConfidence = (answers.reduce((sum, a) => sum + a.evaluation.confidence, 0) / answers.length).toFixed(1);

    let content = `INTERVIEW PERFORMANCE REPORT
${'='.repeat(80)}

Role: ${selectedRole}
Date: ${new Date().toLocaleDateString()}
Total Questions: ${answers.length}
Total Filler Words: ${totalFillers}

OVERALL SCORES
${'-'.repeat(80)}
Average Relevance:  ${avgRelevance}/10
Average Clarity:    ${avgClarity}/10
Average Confidence: ${avgConfidence}/10

`;

    answers.forEach((answer, idx) => {
      content += `
${'='.repeat(80)}
QUESTION ${idx + 1}
${'-'.repeat(80)}
${answer.question}

YOUR ANSWER:
${answer.answer}

FILLER WORDS: ${answer.fillerCount}

SCORES:
  Relevance:    ${answer.evaluation.relevance}/10
  Clarity:      ${answer.evaluation.clarity}/10
  Confidence:   ${answer.evaluation.confidence}/10
  Completeness: ${answer.evaluation.completeness}/10

STRENGTHS:
${answer.evaluation.strengths.map(s => `  ✓ ${s}`).join('\n')}

AREAS FOR IMPROVEMENT:
${answer.evaluation.improvements.map(i => `  • ${i}`).join('\n')}

`;
    });

    content += `
${'='.repeat(80)}
END OF REPORT
${'='.repeat(80)}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${selectedRole.replace(/\s+/g, '-')}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">AI Mock Interviewer</h1>
          <p className="text-gray-600">Practice interviews with real-time speech analysis</p>
        </div>

        {/* Setup Stage */}
        {stage === 'setup' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold mb-6">Select Your Role</h2>
            <div className="grid gap-4 mb-8">
              {Object.keys(ROLES).map(role => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    selectedRole === role
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-semibold text-lg">{role}</div>
                    <div className="text-sm text-gray-600">{ROLES[role].length} questions</div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={startInterview}
              disabled={!selectedRole}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <PlayCircle size={20} />
              Start Interview
            </button>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ Important:</p>
              <ul className="text-sm text-yellow-700 space-y-1 ml-4 list-disc">
                <li>Use Google Chrome browser</li>
                <li>Allow microphone access when prompted</li>
                <li>Speak clearly after clicking the microphone</li>
              </ul>
            </div>
          </div>
        )}

        {/* Interview Stage */}
        {stage === 'interview' && (
          <div className="space-y-6">
            {/* Progress */}
            <div className="bg-white rounded-lg shadow-lg p-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Question {currentQuestion + 1} of {ROLES[selectedRole].length}</span>
                <span>{Math.round(((currentQuestion) / ROLES[selectedRole].length) * 100)}% Complete</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${((currentQuestion) / ROLES[selectedRole].length) * 100}%` }}
                />
              </div>
            </div>

            {/* Question */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="mb-6">
                <div className="text-sm text-gray-500 mb-2">Question {currentQuestion + 1}</div>
                <h3 className="text-2xl font-semibold text-gray-800">
                  {ROLES[selectedRole][currentQuestion]}
                </h3>
              </div>

              {/* Recording Controls */}
              <div className="flex flex-col items-center gap-4 mb-6">
                {!isRecording && !isEvaluating && (
                  <>
                    <button
                      onClick={startRecording}
                      className="bg-green-500 text-white px-8 py-4 rounded-lg hover:bg-green-600 transition-all shadow-lg text-lg font-semibold flex items-center gap-2"
                    >
                      <Mic size={24} />
                      Click to Start Speaking
                    </button>
                    <p className="text-sm text-gray-600 text-center max-w-md">
                      Click the button above and allow microphone access when your browser asks
                    </p>
                  </>
                )}

                {isRecording && (
                  <>
                    <div className="bg-green-100 border-4 border-green-500 rounded-full p-8 animate-pulse">
                      <Mic size={48} className="text-green-600" />
                    </div>
                    <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 text-center">
                      <p className="text-green-800 font-bold text-lg mb-2">🎤 RECORDING NOW</p>
                      <p className="text-sm text-green-600 mb-3">Speak your answer clearly</p>
                      <button
                        onClick={stopRecording}
                        className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 font-semibold flex items-center gap-2 mx-auto"
                      >
                        <MicOff size={20} />
                        Stop & Submit
                      </button>
                    </div>
                  </>
                )}

                {isEvaluating && (
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-gray-600">Evaluating your answer...</p>
                  </div>
                )}
              </div>

              {/* Live Transcript */}
              {transcript && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-blue-800 mb-2">
                    <Mic size={16} />
                    <span className="text-sm font-semibold">Your Answer:</span>
                  </div>
                  <p className="text-gray-800 leading-relaxed">{transcript}</p>
                  <div className="mt-3 flex items-center gap-2 text-orange-600">
                    <AlertCircle size={16} />
                    <span className="text-sm font-semibold">Filler words: {fillerCount}</span>
                  </div>
                </div>
              )}

              {/* Debug Log */}
              {debugLog.length > 0 && (
                <div className="mt-6 bg-gray-100 rounded-lg p-4 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Debug Log:</p>
                  {debugLog.map((log, idx) => (
                    <p key={idx} className="text-xs text-gray-700 font-mono">{log}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Complete Stage */}
        {stage === 'complete' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="text-center mb-8">
              <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-2">Interview Complete!</h2>
              <p className="text-gray-600">Great job! Here's your performance summary.</p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{answers.length}</div>
                <div className="text-sm text-gray-600">Questions</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-orange-600">
                  {answers.reduce((sum, a) => sum + a.fillerCount, 0)}
                </div>
                <div className="text-sm text-gray-600">Filler Words</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">
                  {(answers.reduce((sum, a) => sum + a.evaluation.clarity, 0) / answers.length).toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">Avg Clarity</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-600">
                  {(answers.reduce((sum, a) => sum + a.evaluation.confidence, 0) / answers.length).toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">Avg Confidence</div>
              </div>
            </div>

            {/* Download Button */}
            <button
              onClick={generateReport}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center gap-2 mb-4"
            >
              <Download size={20} />
              Download Full Report
            </button>

            <button
              onClick={() => {
                setStage('setup');
                setSelectedRole('');
                setAnswers([]);
              }}
              className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300"
            >
              Start New Interview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}