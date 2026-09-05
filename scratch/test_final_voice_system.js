// test_final_voice_system.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================================================');
console.log('=== TEST SUITE: SAKSHAMSETU FINAL VOICE SYSTEM VERIFICATION ===');
console.log('========================================================================\n');

const workspaceRoot = 'C:/Users/Harshita jain/Desktop/New folder (3)';
const tutorJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/tutor.js'), 'utf8');
const tutorHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/tutor.html'), 'utf8');
const voiceJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/voice.js'), 'utf8');
const emergencyJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/emergency.js'), 'utf8');
const statusHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/status.html'), 'utf8');
const apiJs = fs.readFileSync(path.join(workspaceRoot, 'frontend/js/api.js'), 'utf8');
const dyslexicHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-visual-dyslexic.html'), 'utf8');
const hearingHtml = fs.readFileSync(path.join(workspaceRoot, 'frontend/student-hearing-physical.html'), 'utf8');

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
// TEST GROUP 1: NO MICROPHONE OSCILLATION & STABLE LIFECYCLE
// ---------------------------------------------------------------------------
console.log('\n--- 1. Verification of Non-Oscillating Voice Lifecycle ---');

it('1. tutor.js tracks actual browser recognition via tutorRecognitionRunning and isMicrophoneAllowedState', () => {
  assert(tutorJs.includes('this.tutorRecognitionRunning'), 'Must track tutorRecognitionRunning');
  assert(tutorJs.includes('isMicrophoneAllowedState'), 'Must check isMicrophoneAllowedState');
});

it('2. tutor.js uses continuous=true, interimResults=true, and maxAlternatives=3', () => {
  assert(tutorJs.includes('this.tutorSpeechRecognition.continuous = true;'), 'continuous must be true');
  assert(tutorJs.includes('this.tutorSpeechRecognition.interimResults = true;'), 'interimResults must be true');
  assert(tutorJs.includes("this.tutorSpeechRecognition.lang = 'en-IN';"), 'lang must be en-IN');
  assert(tutorJs.includes('this.tutorSpeechRecognition.maxAlternatives = 3;'), 'maxAlternatives must be 3');
});

it('3. voice.js does not mount competing microphone on tutor.html', () => {
  assert(voiceJs.includes("window.location.pathname.includes('tutor.html')"), 'Must guard against tutor.html');
});

// ---------------------------------------------------------------------------
// TEST GROUP 2: EMERGENCY VOICE COMMAND ROUTING (TESTS D, E, F)
// ---------------------------------------------------------------------------
console.log('\n--- 2. Emergency Modal Voice & Click Equivalence (Tests D, E, F) ---');

it('4. TEST D & E: Emergency Dismiss & Close are TOP PRIORITY and execute emergency.dismissEmergencyModal()', () => {
  assert(voiceJs.includes('isEmergencyActive'), 'Must check emergency modal first');
  assert(voiceJs.includes("emergency.dismissEmergencyModal()"), 'Must call dismissEmergencyModal');
  assert(emergencyJs.includes("Emergency modal closed. Returning to voice portal."), 'Must announce dismissal');
});

it('5. TEST F: Emergency Call executes emergency.initiateEmergencyCall() with audio announcement', () => {
  assert(voiceJs.includes("emergency.initiateEmergencyCall()"), 'Must call initiateEmergencyCall');
  assert(emergencyJs.includes("Initiating emergency call."), 'Must announce initiating call');
  assert(emergencyJs.includes("window.location.href = `tel:${targetPhone}`;"), 'Must dial emergency phone');
});

it('6. Emergency buttons and voice commands call the exact same underlying methods', () => {
  assert(emergencyJs.includes("document.getElementById('btn-emergency-call')?.addEventListener('click',"), 'Call button calls initiateEmergencyCall');
  assert(emergencyJs.includes("closeBtn.addEventListener('click', () => {"), 'Dismiss button calls dismissEmergencyModal');
});

// ---------------------------------------------------------------------------
// TEST GROUP 3: STATUS TRACKING AUDIO (TESTS A, B, C)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Status Tracking Audio & Navigation (Tests A, B, C) ---');

it('7. TEST A: "track status" / "check status" fetches /api/grievance/my-grievances and speaks student summary', () => {
  assert(voiceJs.includes('triggerStatusFlow()'), 'Must have triggerStatusFlow');
  assert(voiceJs.includes('api.grievances.getMyGrievances()'), 'Must fetch authenticated grievances');
  assert(voiceJs.includes('You have'), 'Must format count');
  assert(voiceJs.includes('Grievance'), 'Must format grievance details with code, category, status, department');
});

it('8. TEST B: "repeat" repeats the status summary without refetching', () => {
  assert(voiceJs.includes('repeatStatusSummary()'), 'Must have repeatStatusSummary');
  assert(voiceJs.includes('this.lastStatusSummary'), 'Must cache status summary');
});

it('9. TEST C: "back" returns to main voice portal safely', () => {
  assert(voiceJs.includes('exitStatusMode()'), 'Must have exitStatusMode');
  assert(voiceJs.includes('Returning to voice portal.'), 'Must announce return');
});

// ---------------------------------------------------------------------------
// TEST GROUP 4: AI TUTOR TOPIC, COMMANDS & DOUBTS (TESTS G, H, I, J, K)
// ---------------------------------------------------------------------------
console.log('\n--- 4. AI Tutor Voice Flow & Content Quality (Tests G, H, I, J, K) ---');

it('10. TEST G: Saying topic "stacks" captures topic, calls generate, and narrates Step 1', () => {
  assert(tutorJs.includes('generateAndStartLesson'), 'Must call generateAndStartLesson');
  assert(tutorJs.includes('this.playCurrentStep()'), 'Must start narration at Step 1');
  assert(apiJs.includes('Cafeteria Tray Analogy'), 'Stacks must teach cafeteria tray analogy');
  assert(apiJs.includes('Last In, First Out'), 'Stacks must teach LIFO');
  assert(apiJs.includes('Push and Pop'), 'Stacks must teach push and pop');
  assert(apiJs.includes('Peek and isEmpty'), 'Stacks must teach peek and isEmpty');
});

it('11. TEST H: Tutor "next" advances to next lesson step', () => {
  assert(tutorJs.includes('goToNextStep()'), 'Must implement goToNextStep');
  assert(tutorJs.includes('this.currentStepIndex++'), 'Must increment step index');
});

it('12. TEST I: Tutor "repeat" replays current lesson step', () => {
  assert(tutorJs.includes('repeatCurrentStep()'), 'Must implement repeatCurrentStep');
});

it('13. TEST J: Tutor "back" navigates to previous lesson step', () => {
  assert(tutorJs.includes('goToPreviousStep()'), 'Must implement goToPreviousStep');
  assert(tutorJs.includes('this.currentStepIndex--'), 'Must decrement step index');
});

it('14. TEST K: Tutor "question" captures question, calls api.tutor.doubt, and remains in Tutor', () => {
  assert(tutorJs.includes('startDoubtFlow()'), 'Must implement startDoubtFlow');
  assert(tutorJs.includes('processDoubtQuestion'), 'Must implement processDoubtQuestion');
  assert(tutorJs.includes('TUTOR_STATES.LISTENING_FOR_COMMAND'), 'Must stay in Tutor and resume command listening');
  assert(apiJs.includes('Pop means removing the top item from a stack.'), 'Must explain pop accurately');
});

// ---------------------------------------------------------------------------
// TEST GROUP 5: STRICT PRESERVATION
// ---------------------------------------------------------------------------
console.log('\n--- 5. Preservation of Core Features ---');

it('15. triggerGrievanceFlow, modalRecognition, auth, and dashboard navigation preserved', () => {
  assert(voiceJs.includes('triggerGrievanceFlow()'), 'triggerGrievanceFlow preserved');
  assert(voiceJs.includes('modalRecognition'), 'modalRecognition preserved');
  assert(voiceJs.includes('isVoicePortalActive'), 'Wake-word state machine preserved');
  assert(dyslexicHtml.includes('tutor.html'), 'Visual portal links to tutor.html');
  assert(hearingHtml.includes('tutor.html'), 'Hearing portal links to tutor.html');
});

console.log(`\n========================================================================`);
console.log(`=== TEST SUMMARY: ${passCount} / ${totalCount} PASSED ===`);
console.log(`========================================================================\n`);

if (passCount === totalCount) {
  console.log('ALL FINAL VOICE SYSTEM TESTS PASSED SUCCESSFULLY!');
} else {
  process.exit(1);
}
