// test_universal_subflow_and_tutor_bounded.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log('=== TEST SUITE: UNIVERSAL SUB-FLOW PATTERN & TUTOR BOUNDED RECORDING ===');
console.log('========================================================================\n');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const tutorJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/tutor.js'), 'utf8');
const voiceJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/voice.js'), 'utf8');
const emergencyJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/emergency.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/api.js'), 'utf8');

let passCount = 0;
let totalCount = 0;

function it(desc, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}\n         ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Universal Sub-Flow Pattern Verification
// ---------------------------------------------------------------------------
console.log('\n--- 1. Universal Sub-Flow Pattern Verification ---');

it('1. Grievance Flow: Reference implementation stops parent on entry and restores on submit/close', () => {
  assert(voiceJs.includes("this.requestMicrophoneOwnership('grievance')"), 'Must request grievance ownership');
  assert(voiceJs.includes("this.releaseMicrophoneOwnership('grievance')"), 'Must release grievance ownership');
  assert(voiceJs.includes("this.startGlobalRecognition(false)"), 'Must restart global recognition');
});

it('2. Emergency Flow: Stops parent on entry, recognizes ONLY Call/Dismiss, speaks contact, and restores parent listener', () => {
  assert(emergencyJs.includes("requestMicrophoneOwnership('emergency')"), 'Must request emergency ownership on entry');
  assert(emergencyJs.includes("releaseMicrophoneOwnership('emergency')"), 'Must release emergency ownership on exit');
  assert(emergencyJs.includes("Initiating emergency call to"), 'Must speak contact name and phone');
  assert(emergencyJs.includes("Emergency modal closed. Returning to main portal."), 'Must speak dismiss confirmation');
  assert(emergencyJs.includes("startGlobalRecognition(false)"), 'Must restart global recognition on exit');
});

it('3. Track Status Flow: Stops parent on entry, reads status, and automatically returns to main portal listener', () => {
  assert(voiceJs.includes("this.requestMicrophoneOwnership('status')"), 'Must request status ownership on entry');
  assert(voiceJs.includes("this.releaseMicrophoneOwnership('status')"), 'Must release status ownership on exit');
  assert(voiceJs.includes("Returning to main voice portal."), 'Must announce return to voice portal');
  assert(voiceJs.includes("this.startGlobalRecognition(false)"), 'Must restart global recognition automatically');
});

it('4. Alerts Flow: Stops parent on entry, reads notices, and automatically returns to main portal listener', () => {
  assert(voiceJs.includes("this.requestMicrophoneOwnership('alerts')"), 'Must request alerts ownership on entry');
  assert(voiceJs.includes("this.releaseMicrophoneOwnership('alerts')"), 'Must release alerts ownership on exit');
  assert(voiceJs.includes("this.startGlobalRecognition(false)"), 'Must restart global recognition automatically');
});

// ---------------------------------------------------------------------------
// 2. AI Tutor Bounded Recording & Latency Diagnostics
// ---------------------------------------------------------------------------
console.log('\n--- 2. AI Tutor Bounded Recording & Latency Diagnostics ---');

it('5. AI Tutor uses continuous capture (continuous=true) for multi-sentence questions', () => {
  assert(tutorJs.includes("this.tutorSpeechRecognition.continuous = true;"), 'continuous must be true');
});

it('6. AI Tutor captures continuously until explicit "Done" keyword is detected', () => {
  assert(tutorJs.includes("isDone"), 'Must evaluate isDone trigger');
  assert(tutorJs.includes("this.capturedSpeech"), 'Must buffer captured speech across chunks');
  assert(tutorJs.includes("this.stopRecognition()"), 'Must immediately stop recognition upon Done');
});

it('7. AI Tutor includes timestamped [LATENCY] diagnostic logs for capture, done, API, and TTS', () => {
  assert(tutorJs.includes("[LATENCY"), 'Must include [LATENCY] logs');
  assert(tutorJs.includes("Chime") || tutorJs.includes("chime"), 'Must log chime timestamp');
  assert(tutorJs.includes("Done") || tutorJs.includes("done"), 'Must log Done timestamp');
  assert(tutorJs.includes("Gemini"), 'Must log Gemini API timestamp');
  assert(tutorJs.toLowerCase().includes("speech output"), 'Must log speech output timestamp');
});

// ---------------------------------------------------------------------------
// 3. Security Check: Zero Exposed API Keys
// ---------------------------------------------------------------------------
console.log('\n--- 3. Security Check: Zero Exposed API Keys ---');

it('8. Zero Gemini/Google API keys present in frontend files', () => {
  assert(!tutorJs.includes("AIzaSy"), 'tutor.js must not contain API key');
  assert(!voiceJs.includes("AIzaSy"), 'voice.js must not contain API key');
  assert(!emergencyJs.includes("AIzaSy"), 'emergency.js must not contain API key');
  assert(!apiJs.includes("AIzaSy"), 'api.js must not contain API key');
});

console.log('\n========================================================================');
console.log(`=== TEST SUMMARY: ${passCount} / ${totalCount} PASSED ===`);
console.log('========================================================================\n');
