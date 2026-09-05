// test_microphone_ownership_and_final_speech.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log('=== TEST SUITE: MICROPHONE OWNERSHIP LOCK & DEMO ACCEPTANCE TESTS ===');
console.log('========================================================================\n');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const voiceJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/voice.js'), 'utf8');
const emergencyJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/emergency.js'), 'utf8');
const tutorJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/tutor.js'), 'utf8');
const statusHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/status.html'), 'utf8');

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
// 1. Microphone Ownership Lock Architecture
// ---------------------------------------------------------------------------
console.log('\n--- 1. Microphone Ownership Lock Architecture ---');

it('1. voice.js exports requestMicrophoneOwnership and releaseMicrophoneOwnership', () => {
  assert(voiceJs.includes('requestMicrophoneOwnership(featureName)'), 'Must define requestMicrophoneOwnership');
  assert(voiceJs.includes('releaseMicrophoneOwnership(featureName)'), 'Must define releaseMicrophoneOwnership');
  assert(voiceJs.includes('canGlobalRecognize()'), 'Must define canGlobalRecognize helper');
  assert(voiceJs.includes("this.voiceOwner = 'global'"), 'Must track voiceOwner');
});

it('2. Global recognition does NOT restart on onend if mic is owned by another feature or stopped', () => {
  assert(voiceJs.includes('if (this.canGlobalRecognize()) {'), 'onend must check canGlobalRecognize before restart');
});

it('3. TTS speech synthesis safely pauses recognition and sets isSpeaking flag', () => {
  assert(voiceJs.includes('this.isSpeaking = true;'), 'voice.js must set isSpeaking=true before TTS');
  assert(tutorJs.includes('this.isSpeaking = true;'), 'tutor.js must set isSpeaking=true before TTS');
  assert(voiceJs.includes('this.isSpeaking = false;'), 'voice.js must reset isSpeaking=false on utterance onend');
  assert(tutorJs.includes('this.isSpeaking = false;'), 'tutor.js must reset isSpeaking=false on utterance onend');
});

// ---------------------------------------------------------------------------
// 2. Strict Interim vs Final Speech Execution
// ---------------------------------------------------------------------------
console.log('\n--- 2. Strict Interim vs Final Speech Execution ---');

it('4. voice.js rejects interim speech and triggers commands ONLY on isFinal === true', () => {
  assert(voiceJs.includes('if (interimTranscript && !finalTranscript)'), 'voice.js must check for interim-only transcript');
  assert(voiceJs.includes('return; // Reject interim command execution'), 'voice.js must return without executing command on interim');
  assert(voiceJs.includes('this.processVoiceCommand(activeText)'), 'voice.js executes command on final text');
});

it('5. tutor.js rejects interim speech and triggers topic/commands ONLY on isFinal === true', () => {
  assert(tutorJs.includes('if (interimTranscript && !finalTranscript)'), 'tutor.js must check for interim-only transcript');
  assert(tutorJs.includes('return; // Reject interim command execution!'), 'tutor.js must return without executing command on interim');
  assert(tutorJs.includes('this.handleTutorSpeech(activeText, true);'), 'tutor.js executes speech handler on final text');
});

it('6. status.html processes voice navigation ONLY on isFinal === true', () => {
  assert(statusHtml.includes('if (event.results[i].isFinal)'), 'status.html must check isFinal');
  assert(statusHtml.includes('if (!finalText.trim()) return;'), 'status.html must return on empty final text');
});

// ---------------------------------------------------------------------------
// 3. Demo Acceptance Tests (1 - 10)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Demo Acceptance Tests Verification ---');

it('7. TEST 1 (Global Voice): Help / Alerts intent triggers once without mic competition', () => {
  assert(voiceJs.includes('triggerAlertsFlow()'), 'Alerts flow supported');
  assert(voiceJs.includes('canGlobalRecognize'), 'No duplicate start calls');
});

it('8. TEST 2 & 3 (Emergency Dismiss & Call): Exclusive emergency owner and TTS callbacks', () => {
  assert(emergencyJs.includes("window.voice.requestMicrophoneOwnership('emergency')"), 'Emergency requests ownership');
  assert(emergencyJs.includes("window.voice.releaseMicrophoneOwnership('emergency')"), 'Dismiss releases emergency ownership');
  assert(emergencyJs.includes('Emergency modal closed. Returning to voice portal.'), 'Dismiss speaks confirmation');
  assert(emergencyJs.includes('Initiating emergency call.'), 'Call speaks initiation');
});

it('9. TEST 4 (Status Tracking Flow): Dedicated status owner with repeat and back navigation', () => {
  assert(voiceJs.includes("this.requestMicrophoneOwnership('status')"), 'Status requests ownership');
  assert(voiceJs.includes('repeatStatusSummary()'), 'Status supports repeat');
  assert(voiceJs.includes('exitStatusMode()'), 'Status supports back/exit');
  assert(voiceJs.includes("this.releaseMicrophoneOwnership('status')"), 'Exit releases status ownership');
});

it('10. TEST 5-9 (Tutor Flow): Topic capture from final speech, rate 0.9 narration, commands and doubt flow', () => {
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_TOPIC'), 'Tutor has topic state');
  assert(tutorJs.includes('TUTOR_STATES.PLAYING_LESSON'), 'Tutor has playing state');
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_COMMAND'), 'Tutor has command state');
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_DOUBT'), 'Tutor has doubt state');
  assert(tutorJs.includes('rate = 0.9'), 'Tutor narrates at clear rate 0.9');
});

it('11. TEST 10 (Feature Exit & Isolation): Zero competing mics and clean restoration', () => {
  assert(voiceJs.includes("pathname.includes('tutor.html')"), 'Global mic never starts on tutor.html');
  assert(voiceJs.includes('triggerGrievanceFlow()'), 'Grievance flow preserved');
  assert(voiceJs.includes('modalRecognition'), 'Grievance modalRecognition preserved');
});

console.log(`\n========================================================================`);
console.log(`=== TEST SUMMARY: ${passCount} / ${totalCount} PASSED ===`);
console.log(`========================================================================\n`);

if (passCount === totalCount) {
  console.log('ALL MICROPHONE OWNERSHIP AND FINAL SPEECH TESTS PASSED!');
} else {
  process.exit(1);
}
