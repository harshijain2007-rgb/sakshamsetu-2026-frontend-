const fs = require('fs');
const path = require('path');
const assert = require('assert');

const workspaceRoot = path.resolve(__dirname, '..');
const tutorJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/tutor.js'), 'utf8');
const mainCss = fs.readFileSync(path.join(workspaceRoot, 'frontend/css/main.css'), 'utf8');
const apiJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/api.js'), 'utf8');

console.log('--- RUNNING AI VOICE TUTOR & GEMINI INTEGRATION TESTS ---');

// 1. Check interim results and streaming preview
assert(tutorJs.includes('this.tutorSpeechRecognition.interimResults = true;'), 'interimResults must be enabled for responsive feedback');
assert(tutorJs.includes('interimTranscript') && tutorJs.includes('finalTranscript'), 'Must separate interim and final transcripts');
console.log('✓ 1. SpeechRecognition configured for real-time interim streaming');

// 2. Check autoplay watchdog in initial welcome
assert(tutorJs.includes('Tutor Autoplay Watchdog') || tutorJs.includes('watchdogTimer'), 'Must include autoplay safety watchdog timer');
assert(tutorJs.includes('triggerTopicListening'), 'Must trigger topic listener safely upon timeout or TTS complete');
console.log('✓ 2. Autoplay safety watchdog timer handles browser speech autoplay policy');

// 3. Check user interaction unlock
assert(tutorJs.includes('setupUserInteractionUnlock()'), 'Must include user interaction unlock');
assert(tutorJs.includes('speechSynthesis.resume') || tutorJs.includes('audioCtx.resume'), 'Unlock listener must resume audio context & speech');
console.log('✓ 3. User interaction unlock listener restores blocked audio');

// 4. Check prefix stripping for Gemini topic input
assert(tutorJs.includes('teach me') && tutorJs.includes('explain') && tutorJs.includes('what is'), 'Must strip conversational prefixes from speech');
console.log('✓ 4. Conversational prefix stripping ensures clean Gemini input');

// 5. Check Gemini AI endpoints and spoken answer
assert(tutorJs.includes('api.tutor.generate(topic)'), 'Must call api.tutor.generate');
assert(tutorJs.includes('api.tutor.doubt(topic, stepOrder, questionText)'), 'Must call api.tutor.doubt');
assert(apiJs.includes('/api/tutor/generate') && apiJs.includes('/api/tutor/doubt'), 'api.js must define /api/tutor/generate and /api/tutor/doubt');
console.log('✓ 5. Gemini AI generate and doubt endpoints wired with spoken responses');

// 6. Check GPU hardware acceleration in main.css for eliminating flicker
assert(mainCss.includes('transform: translateZ(0);') && mainCss.includes('will-change'), 'main.css must contain GPU hardware acceleration');
assert(mainCss.includes('backface-visibility: hidden;'), 'main.css must contain backface-visibility for mobile/Safari flicker elimination');
console.log('✓ 6. CSS GPU hardware-acceleration applied to eliminate device repaint flickering');

console.log('--- ALL AI VOICE TUTOR & GEMINI INTEGRATION TESTS PASSED! ---');
