/**
 * Saksham Setu AI Tutor — 100% Voice-Driven & Accessible Controller
 * 
 * Implements an isolated, audio-first state machine for hands-free interactive study:
 * 1. Initial Spoken Welcome + 500ms Chime -> TUTOR_TOPIC_LISTENING
 * 2. Spoken Topic Capture (e.g. "stacks", "binary search") -> /api/tutor/generate
 * 3. Automatic Step-by-Step Educational Lesson Narration (rate = 0.9)
 * 4. Resilient Command Listening ("Next", "Back", "Repeat", "Question")
 * 5. Integrated Doubt Flow ("Question", "Doubt") -> /api/tutor/doubt -> Spoken Answer -> Resume Command Listening
 * 
 * Strict isolation & lifecycle rules:
 * - NEVER runs simultaneously with globalRecognition or modalRecognition.
 * - Stops recognition before any TTS speech synthesis to eliminate audio feedback loops.
 * - UI reflects logical voice state (isListeningIntended), NOT raw onend browser disconnects (no rapid flickering).
 * - Handles all microphone permission, continuous listening, and recovery states safely.
 */

import { api } from './api.js';

function tutorTrace(label, details = '') {
  const suffix = details === '' ? '' : ` ${typeof details === 'string' ? details : JSON.stringify(details)}`;
  console.log(`[TUTOR TRACE ${new Date().toISOString()}] ${label}${suffix}`);
}

export const TUTOR_STATES = {
  IDLE: 'IDLE',
  LISTENING_FOR_TOPIC: 'LISTENING_FOR_TOPIC',
  GENERATING: 'GENERATING',
  PLAYING_LESSON: 'PLAYING_LESSON',
  LISTENING_FOR_COMMAND: 'LISTENING_FOR_COMMAND',
  LISTENING_FOR_DOUBT: 'LISTENING_FOR_DOUBT'
};

export class TutorVoiceController {
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasRecognition = !!SpeechRecognition;
    this.hasSynthesis = 'speechSynthesis' in window;
    this.synth = window.speechSynthesis;
    this.activeVoice = null;

    this.tutorSpeechRecognition = null;
    this.tutorRecognitionRunning = false;  // Tracks actual browser microphone state
    this.isListeningIntended = false;      // Intended state flag: true when in active listening window
    this.lastOnEndTime = 0;                // Diagnostics timestamp tracker
    this.isSpeaking = false;               // Tracks TTS speech synthesis
    this.hasPermissionError = false;
    this.restartTimer = null;
    this.audioCtx = null;
    this.state = TUTOR_STATES.IDLE;

    // Active lesson state
    this.currentTopic = '';
    this.currentLesson = null;
    this.currentStepIndex = 0;

    if (this.hasSynthesis) {
      const loadVoices = () => {
        const voices = this.synth.getVoices();
        this.activeVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
      };
      window.speechSynthesis.onvoiceschanged = loadVoices;
      loadVoices();
    }

    if (this.hasRecognition) {
      this.initTutorRecognition();
      this.setupUserInteractionUnlock();
    } else {
      console.warn('[Tutor Voice]: SpeechRecognition is not supported in this browser.');
    }

    this.setupBadgeToggle();
    this.setupLifecycleCleanups();
  }

  setupBadgeToggle() {
    if (typeof window === 'undefined') return;
    const bindToggle = () => {
      const badge = document.getElementById('tutor-mic-label')?.parentElement;
      if (badge) {
        badge.style.cursor = 'pointer';
        badge.title = 'Click to toggle Listening / Standby';
        badge.addEventListener('click', () => {
          if (this.isListeningIntended) {
            this.state = TUTOR_STATES.IDLE;
            this.setListeningIntended(false, 'Listening paused. Click here or say "Start" to resume.');
          } else {
            this.playChime(660, 0.4);
            setTimeout(() => {
              if (this.currentLesson) {
                this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
                this.setListeningIntended(true, `Listening for commands: Say "Next", "Back", "Repeat", "Question", or "Stop".`);
              } else {
                this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
                this.setListeningIntended(true, 'Listening for your study topic... Speak freely and say "Done" when finished.');
              }
            }, 450);
          }
        });
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindToggle);
    } else {
      bindToggle();
    }
  }

  isMicrophoneAllowedState() {
    return this.isListeningIntended && (
      this.state === TUTOR_STATES.LISTENING_FOR_TOPIC ||
      this.state === TUTOR_STATES.LISTENING_FOR_COMMAND ||
      this.state === TUTOR_STATES.LISTENING_FOR_DOUBT
    );
  }

  /**
   * Single authority for transitioning intended listening state and updating the UI badge.
   * Background SpeechRecognition restarts do NOT touch this method.
   */
  setListeningIntended(intended, statusText = null) {
    this.isListeningIntended = !!intended;
    this.updateStatusBadge(this.isListeningIntended);
    if (statusText) {
      this.updateStatusText(statusText);
    }
    if (this.isListeningIntended) {
      this.startRecognition();
    } else {
      this.stopRecognition();
    }
  }

  // =========================================================================
  // 1. Audio Chime Generator (500ms tone via Web Audio API)
  // =========================================================================
  playChime(frequency = 660, duration = 0.5) {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.audioCtx) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
      }
    } catch (e) {
      console.warn('[Tutor Audio Chime] Warning:', e);
    }
  }

  // =========================================================================
  // 2. Speech Synthesis Helper with Strict Recognition Isolation
  // =========================================================================
  speak(text, rate = 0.9, onComplete = null) {
    // Stop microphone safely before speaking to eliminate feedback
    this.stopRecognition();
    tutorTrace('response spoken', text);
    this.isSpeaking = true;

    if (!this.hasSynthesis) {
      this.isSpeaking = false;
      if (onComplete) setTimeout(onComplete, 300);
      return;
    }

    this.synth.cancel(); // Clear any pending speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate; // 0.9 for slow, clear lesson reading
    utterance.pitch = 1.0;
    if (this.activeVoice) utterance.voice = this.activeVoice;

    utterance.onend = () => {
      this.isSpeaking = false;
      if (onComplete) {
        onComplete();
      }
    };

    utterance.onerror = (e) => {
      console.warn('[Tutor TTS Error]:', e);
      this.isSpeaking = false;
      if (onComplete) {
        onComplete();
      }
    };

    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.hasSynthesis) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
  }

  // =========================================================================
  // 3. Isolated Tutor Speech Recognition Lifecycle (Continuous Bounded Window)
  // =========================================================================
  initTutorRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.tutorSpeechRecognition = new SpeechRecognition();
    this.tutorSpeechRecognition.continuous = true; // Continuous multi-sentence capture until "Done"
    this.tutorSpeechRecognition.interimResults = false;
    this.tutorSpeechRecognition.lang = 'en-IN';
    this.tutorSpeechRecognition.maxAlternatives = 3;

    this.tutorSpeechRecognition.onstart = () => {
      this.tutorRecognitionRunning = true;
      const gap = this.lastOnEndTime ? (Date.now() - this.lastOnEndTime) : 0;
      tutorTrace('listener started', { state: this.state, intended: this.isListeningIntended });
      console.log(`[LATENCY ${new Date().toISOString()}] [TUTOR MIC]: Recognition active (gap: ${gap}ms, continuous: ${this.tutorSpeechRecognition.continuous}, intended: ${this.isListeningIntended})`);
    };

    this.tutorSpeechRecognition.onresult = (event) => {
      const lastIdx = event.results.length - 1;
      const activeText = event.results[lastIdx][0].transcript.trim();
      if (!activeText) return;

      tutorTrace('transcript ready', { state: this.state, transcript: activeText });
      console.log(`[LATENCY ${new Date().toISOString()}] [TUTOR MIC]: Speech result received: "${activeText}"`);
      this.handleTutorSpeech(activeText, true);
    };

    this.tutorSpeechRecognition.onerror = (e) => {
      console.warn(`[LATENCY ${new Date().toISOString()}] [TUTOR MIC] error in state ${this.state}:`, e.error);
      this.tutorRecognitionRunning = false;

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.hasPermissionError = true;
        this.setListeningIntended(false);
        const permMsg = "Microphone access is required for voice control. Please allow microphone access in your browser.";
        this.updateStatusText(permMsg);
        this.speak(permMsg);
        return;
      }

      if (e.error === 'audio-capture') {
        this.setListeningIntended(false);
        this.updateStatusText("No usable microphone was found. Please check your audio settings.");
        return;
      }
    };

    this.tutorSpeechRecognition.onend = () => {
      this.tutorRecognitionRunning = false;
      this.lastOnEndTime = Date.now();
      tutorTrace('speech-end', { state: this.state, intended: this.isListeningIntended });
      console.log(`[LATENCY ${new Date().toISOString()}] [TUTOR MIC]: Recognition ended (intended: ${this.isListeningIntended})`);

      // Silently restart recognition in the background without touching the UI status badge
      if (this.isListeningIntended && !this.isSpeaking && !this.hasPermissionError) {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          if (this.isListeningIntended && !this.isSpeaking && !this.hasPermissionError) {
            this.startRecognition();
          }
        }, 150);
      }
    };
  }

  startRecognition() {
    tutorTrace('listener start requested', { state: this.state, intended: this.isListeningIntended });
    if (!this.hasRecognition || this.hasPermissionError || this.isSpeaking) return;
    if (!this.isMicrophoneAllowedState()) return;

    clearTimeout(this.restartTimer);
    if (this.tutorRecognitionRunning) return; // Do not call start if already running

    try {
      this.tutorSpeechRecognition.start();
    } catch (e) {
      console.warn('[Tutor Voice] start error:', e);
    }
  }

  startRecognitionSafely() {
    this.startRecognition();
  }

  stopRecognition() {
    tutorTrace('listener stop requested', { state: this.state });
    clearTimeout(this.restartTimer);
    if (this.tutorSpeechRecognition && this.tutorRecognitionRunning) {
      try {
        this.tutorSpeechRecognition.stop();
      } catch (e) {}
    }
    this.tutorRecognitionRunning = false;
  }

  stopRecognitionSafely() {
    this.stopRecognition();
  }

  setupUserInteractionUnlock() {
    const unlock = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  setupLifecycleCleanups() {
    const cleanup = () => {
      this.stopSpeaking();
      this.stopRecognitionSafely(true);
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
  }

  // =========================================================================
  // 4. Initial Spoken Welcome Flow on Page Load
  // =========================================================================
  startInitialWelcome() {
    if (!this.hasRecognition) {
      const unsupportedText = "Voice input is not supported in this browser. Please use Chrome or another supported browser, or use the text box below.";
      this.updateStatusText(unsupportedText);
      this.speak(unsupportedText, 0.95);
      return;
    }

    const welcomeText = "Welcome to AI Tutor! What topic would you like to learn today? Say a topic name after the chime, then say Done.";
    this.updateStatusText('Welcome to AI Tutor! Say a topic name after the chime, then say Done.');
    
    this.speak(welcomeText, 0.95, () => {
      console.log(`[LATENCY ${new Date().toISOString()}] Initial welcome TTS finished. Playing chime and starting topic capture.`);
      this.playChime(660, 0.5);
      setTimeout(() => {
        this.capturedSpeech = '';
        this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
        this.setListeningIntended(true, 'Listening for your study topic... Speak freely and say "Done" when finished.');
      }, 550);
    });
  }

  // =========================================================================
  // 5. Speech Dispatcher & State Machine (Bounded Capture Window)
  // =========================================================================
  handleTutorSpeech(transcript, isFinal = false) {
    const rawTranscript = transcript;
    const chunk = transcript.trim();
    const lower = chunk.toLowerCase();
    const command = lower.replace(/[.,!?]/g, '');

    console.log(`[LATENCY ${new Date().toISOString()}] [TUTOR VOICE] State: ${this.state}, Received chunk: "${chunk}"`);

    // -----------------------------------------------------------------------
    // Global Stop / Pause Command: "stop", "pause", "stop listening", "mute", "sleep"
    // -----------------------------------------------------------------------
    if (/^(stop|pause|stop listening|mute|sleep)$/i.test(command) || command === 'stop' || command === 'pause') {
      tutorTrace('command matched', { command: 'STOP', state: this.state });
      console.log(`[LATENCY ${new Date().toISOString()}] [TUTOR VOICE] Stop command detected. Transitioning to STANDBY.`);
      this.state = TUTOR_STATES.IDLE;
      this.setListeningIntended(false, 'Voice tutor paused. Say "Start" or tap microphone to resume.');
      this.speak('Voice tutor paused.');
      return;
    }

    // -----------------------------------------------------------------------
    // Global Start / Resume Command when in IDLE: "start", "resume", "activate", "listen", "wake up"
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.IDLE) {
      if (/\b(start|resume|activate|listen|wake up)\b/i.test(command) || command === 'start' || command === 'resume') {
        tutorTrace('command matched', { command: 'START' });
        console.log(`[LATENCY ${new Date().toISOString()}] [TUTOR VOICE] Start command detected in IDLE.`);
        this.playChime(660, 0.4);
        setTimeout(() => {
          if (this.currentLesson) {
            this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
            this.setListeningIntended(true, `Listening for commands: Say "Next", "Back", "Repeat", "Question", or "Stop".`);
          } else {
            this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
            this.setListeningIntended(true, 'Listening for your study topic... Speak freely and say "Done" when finished.');
          }
        }, 450);
        return;
      }
      return;
    }

    // -----------------------------------------------------------------------
    // State 1: Capturing Study Topic (e.g. "stacks", "binary search", "Newton Raphson")
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_TOPIC) {
      if (!chunk) return;

      // Append speech chunk to continuous buffer
      this.capturedSpeech = this.capturedSpeech ? `${this.capturedSpeech} ${chunk}` : chunk;

      // Update DOM
      const topicInput = document.getElementById('topicInput') || document.getElementById('tutor-input');
      if (topicInput) {
        topicInput.value = this.capturedSpeech;
      }
      this.updateStatusText(`Hearing: "${this.capturedSpeech}" (Say "Done" to submit)...`);

      // Check for explicit "done" keyword or clean topic candidate
      const isDone = /\b(done|i'm done|finish|finished|completed|that's all|submit)\b/i.test(lower) || lower.endsWith('done');
      let cleanTopic = this.capturedSpeech
        .replace(/\b(done|i'm done|finish|finished|completed|that's all|submit)\b[.! ]*$/i, '')
        .replace(/^(learn|teach me|i want to learn|study|topic is|topic)\s+/i, '')
        .trim();

      if (!cleanTopic) cleanTopic = this.capturedSpeech.replace(/\b(done|i'm done)\b/ig, '').trim();

      if (isDone && cleanTopic.length >= 2) {
        tutorTrace('command matched', { command: 'DONE', flow: 'TOPIC' });
        console.log(`[LATENCY ${new Date().toISOString()}] Final topic captured: "${cleanTopic}"`);
        this.currentTopic = cleanTopic;
        this.state = TUTOR_STATES.GENERATING;
        this.setListeningIntended(false, `Generating lesson on "${cleanTopic}" with Gemini AI...`);

        if (topicInput) {
          topicInput.value = cleanTopic;
        }

        this.appendUserMessage(cleanTopic);
        this.generateAndStartLesson(cleanTopic);
      }
      return;
    }

    // -----------------------------------------------------------------------
    // State 2: Capturing Spoken Doubt / Question (Continuous until "done")
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_DOUBT) {
      if (!chunk) return;

      // Append speech chunk to continuous buffer
      this.capturedSpeech = this.capturedSpeech ? `${this.capturedSpeech} ${chunk}` : chunk;
      this.updateStatusText(`Hearing question: "${this.capturedSpeech}" (Say "Done" when finished)...`);

      const isDone = /\b(done|i'm done|finish|finished|completed|that's all|submit)\b/i.test(lower) || lower.endsWith('done');
      let cleanQuestion = this.capturedSpeech
        .replace(/\b(done|i'm done|finish|finished|completed|that's all|submit)\b[.! ]*$/i, '')
        .replace(/^(i have a question|my question is|question is|question)\s+/i, '')
        .trim();

      if (!cleanQuestion) cleanQuestion = this.capturedSpeech.replace(/\b(done|i'm done)\b/ig, '').trim();

      if (isDone && cleanQuestion.length >= 3) {
        tutorTrace('command matched', { command: 'DONE', flow: 'DOUBT' });
        console.log(`[LATENCY ${new Date().toISOString()}] Final question captured: "${cleanQuestion}"`);
        this.state = TUTOR_STATES.GENERATING;
        this.setListeningIntended(false, 'Finding explanation from Gemini AI...');
        this.appendUserMessage(`Question: ${cleanQuestion}`);
        this.processDoubtQuestion(cleanQuestion);
      }
      return;
    }

    // -----------------------------------------------------------------------
    // State 3: Listening for Navigation & Doubt Commands
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_COMMAND) {
      // 1. Next / More / Continue / Proceed
      if (/\b(next|more|continue|proceed|go next|next step|move next)\b/i.test(command) || command.includes('next') || command.includes('more')) {
        console.log('[TUTOR] intent recognized: NEXT');
        this.setListeningIntended(false);
        this.goToNextStep();
        return;
      }

      // 2. Previous / Back / Prior
      if (/\b(back|previous|prev|prior|go back|previous step)\b/i.test(command) || command.includes('back') || command.includes('previous')) {
        console.log('[TUTOR] intent recognized: BACK');
        this.setListeningIntended(false);
        this.goToPreviousStep();
        return;
      }

      // 3. Repeat / Again / Say that again
      if (/\b(repeat|again|say that again|repeat this|repeat step|read again|replay)\b/i.test(command) || command.includes('repeat') || command.includes('again')) {
        console.log('[TUTOR] intent recognized: REPEAT');
        this.setListeningIntended(false);
        this.repeatCurrentStep();
        return;
      }

      // 4. Question / Doubt / Help / Explain
      if (/\b(question|doubt|ask question|help|i have a question|explain)\b/i.test(command) || command.includes('question') || command.includes('doubt')) {
        console.log('[TUTOR] intent recognized: QUESTION');
        this.setListeningIntended(false);
        this.startDoubtFlow();
        return;
      }

      // 5. Return to Main Portal
      if (/\b(exit|leave|main portal|voice portal|return to portal|home)\b/i.test(command) || command.includes('exit portal') || command.includes('main portal')) {
        this.setListeningIntended(false);
        this.speak('Returning to main voice portal.', 0.95, () => {
          window.location.href = 'student-visual-dyslexic.html';
        });
        return;
      }

      // 6. Explicit New Topic Request
      if (command.startsWith('learn ') || command.startsWith('study ') || command.startsWith('topic ') || command.startsWith('teach me ')) {
        const newTopic = command.replace(/^(learn|study|topic|teach me)\s+/i, '').trim();
        if (newTopic) {
          console.log('[TUTOR] new topic intent:', newTopic);
          this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
          this.capturedSpeech = newTopic;
          this.handleTutorSpeech(newTopic, true);
          return;
        }
      }
    }
  }

  // =========================================================================
  // 6. Lesson Generation & Playback
  // =========================================================================
  async generateAndStartLesson(topic) {
    const startTime = Date.now();
    tutorTrace('action started', { action: 'GEMINI_GENERATE', topic });
    console.log(`[LATENCY ${new Date().toISOString()}] Sending Gemini generate request for "${topic}"...`);
    this.state = TUTOR_STATES.GENERATING;
    this.setListeningIntended(false, `Generating lesson on "${topic}" with Gemini AI...`);

    try {
      const res = await api.tutor.generate(topic);
      console.log(`[LATENCY ${new Date().toISOString()}] Gemini response received in ${Date.now() - startTime}ms`);
      const lesson = res?.lesson || res;

      if (lesson && Array.isArray(lesson.steps) && lesson.steps.length > 0) {
        this.currentLesson = lesson;
        this.currentStepIndex = 0;
        this.renderLessonContainer(lesson);
        this.playCurrentStep();
      } else {
        throw new Error('No steps received in lesson payload.');
      }
    } catch (err) {
      console.error('[Tutor Generation Error]:', err);
      const errorMsg = "Sorry, I could not create the lesson right now. Please try again.";
      this.updateStatusText(errorMsg);
      this.speak(errorMsg, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
        this.setListeningIntended(true, 'Say any study topic to try again, then say Done.');
      });
    }
  }

  playCurrentStep() {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    const step = this.currentLesson.steps[this.currentStepIndex];
    if (!step) return;

    this.state = TUTOR_STATES.PLAYING_LESSON;
    this.highlightCurrentStepUI(this.currentStepIndex);

    const stepTitle = step.title || `Step ${this.currentStepIndex + 1}`;
    const stepContent = step.content || step.explanation || '';
    const spokenText = `${stepTitle}. ${stepContent}`;

    this.setListeningIntended(false, `Reading: ${stepTitle}`);
    console.log(`[LATENCY ${new Date().toISOString()}] Starting lesson step speech output (Rate 0.9)...`);

    this.speak(spokenText, 0.9, () => {
      this.playChime(660, 0.35);
      setTimeout(() => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
        this.setListeningIntended(true, `Step ${this.currentStepIndex + 1} complete. Say "Next", "Back", "Repeat", "Question", or "Stop".`);
      }, 400);
    });
  }

  goToNextStep() {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    if (this.currentStepIndex < this.currentLesson.steps.length - 1) {
      this.currentStepIndex++;
      this.playCurrentStep();
    } else {
      const finishText = "You are already on the final step. Say Repeat to hear it again, or say Question to ask anything.";
      this.setListeningIntended(false, finishText);
      this.speak(finishText, 0.9, () => {
        this.playChime(660, 0.35);
        setTimeout(() => {
          this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
          this.setListeningIntended(true);
        }, 400);
      });
    }
  }

  goToPreviousStep() {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.playCurrentStep();
    } else {
      const firstText = "You are already on the first step.";
      this.setListeningIntended(false, firstText);
      this.speak(firstText, 0.9, () => {
        this.playChime(660, 0.35);
        setTimeout(() => {
          this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
          this.setListeningIntended(true);
        }, 400);
      });
    }
  }

  repeatCurrentStep() {
    this.playCurrentStep();
  }

  // =========================================================================
  // 7. Voice Doubt Flow (Continuous Bounded Window)
  // =========================================================================
  startDoubtFlow() {
    this.state = TUTOR_STATES.GENERATING;
    const promptText = "What is your question? Speak after the chime, and say Done when you are finished.";
    this.setListeningIntended(false, promptText);

    this.speak(promptText, 0.95, () => {
      console.log(`[LATENCY ${new Date().toISOString()}] Doubt prompt TTS complete. Playing chime...`);
      this.playChime(660, 0.5);
      setTimeout(() => {
        this.capturedSpeech = '';
        this.state = TUTOR_STATES.LISTENING_FOR_DOUBT;
        this.setListeningIntended(true, 'Listening for your question... Ask freely and say "Done" when finished.');
      }, 550);
    });
  }

  async processDoubtQuestion(questionText) {
    const startTime = Date.now();
    tutorTrace('action started', { action: 'GEMINI_DOUBT', question: questionText });
    console.log(`[LATENCY ${new Date().toISOString()}] Sending Gemini doubt request for "${questionText}"...`);
    this.state = TUTOR_STATES.GENERATING;
    this.setListeningIntended(false, 'Finding explanation from Gemini AI...');
    const stepOrder = this.currentStepIndex + 1;
    const topic = this.currentTopic || (this.currentLesson?.topic) || 'Current Topic';

    try {
      const res = await api.tutor.doubt(topic, stepOrder, questionText);
      console.log(`[LATENCY ${new Date().toISOString()}] Gemini doubt response received in ${Date.now() - startTime}ms`);
      const answer = res?.answer || res?.explanation || `Regarding step ${stepOrder}: In simple terms, ${questionText} relates directly to core concepts.`;

      this.appendAiMessage(`<strong>Q: ${questionText}</strong><br><br>${answer}`);

      this.updateStatusText('Reading answer...');
      console.log(`[LATENCY ${new Date().toISOString()}] Starting doubt answer speech output...`);
      tutorTrace('response spoken', { type: 'GEMINI_DOUBT', answer });
      this.speak(answer, 0.95, () => {
        this.playChime(660, 0.35);
        setTimeout(() => {
          this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
          this.setListeningIntended(true, `Answer complete. Say "Next", "Back", "Repeat", "Question", or "Stop".`);
        }, 400);
      });
    } catch (err) {
      console.error('[Tutor Doubt Error]:', err);
      const errorMsg = "Sorry, I could not answer that question right now. Please try again.";
      this.updateStatusText(errorMsg);
      this.speak(errorMsg, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
        this.setListeningIntended(true);
      });
    }
  }

  // =========================================================================
  // 8. DOM UI Render Helpers
  // =========================================================================
  updateStatusBadge(isListening) {
    const dot = document.getElementById('tutor-mic-dot');
    const label = document.getElementById('tutor-mic-label');
    if (dot) {
      dot.className = isListening ? 'w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse' : 'w-2.5 h-2.5 rounded-full bg-slate-400';
    }
    if (label) {
      label.textContent = isListening ? 'LISTENING' : 'STANDBY';
    }
  }

  updateStatusText(text) {
    const statusEl = document.getElementById('tutor-status-text');
    if (statusEl) {
      statusEl.textContent = text;
    }
  }

  appendUserMessage(text) {
    const container = document.getElementById('tutor-chat-messages');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = 'flex items-start justify-end gap-3';
    msg.innerHTML = `
      <div class="p-3.5 bg-navy-brand text-white rounded-2xl text-xs font-medium max-w-md shadow-xs">
        <p>${text}</p>
      </div>
    `;
    container.appendChild(msg);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  appendAiMessage(htmlContent) {
    const container = document.getElementById('tutor-chat-messages');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = 'flex items-start gap-3';
    msg.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-sm">psychology</span>
      </div>
      <div class="p-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 space-y-2 shadow-xs max-w-lg">
        <p class="font-bold text-indigo-700">Saksham AI Tutor</p>
        <p>${htmlContent}</p>
      </div>
    `;
    container.appendChild(msg);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  renderLessonContainer(lesson) {
    const container = document.getElementById('tutor-chat-messages');
    if (!container) return;

    const lessonCard = document.createElement('div');
    lessonCard.id = 'active-lesson-card';
    lessonCard.className = 'p-5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-4';
    lessonCard.innerHTML = `
      <div class="flex items-center justify-between border-b border-blue-200/80 pb-2.5">
        <div>
          <span class="badge-pill bg-blue-100 text-blue-800 text-[10px] font-bold">Interactive Lesson</span>
          <h3 class="text-base font-extrabold text-navy-brand font-heading mt-1">${lesson.title || lesson.topic}</h3>
        </div>
        <div class="flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <span id="lesson-step-counter">Step 1 of ${lesson.steps.length}</span>
        </div>
      </div>

      <div id="lesson-steps-wrapper" class="space-y-3">
        ${lesson.steps.map((step, idx) => `
          <div id="lesson-step-item-${idx}" class="lesson-step-item p-4 rounded-xl border transition-all ${idx === 0 ? 'bg-white border-blue-500 shadow-sm ring-2 ring-blue-100' : 'bg-white/60 border-slate-200 opacity-60'}">
            <div class="flex items-center justify-between mb-1">
              <h4 class="text-xs font-bold text-navy-brand font-heading">${step.title || 'Step ' + (idx + 1)}</h4>
              <span class="text-[10px] font-bold text-slate-400">Step ${idx + 1}</span>
            </div>
            <p class="text-xs text-slate-700 leading-relaxed">${step.content || step.explanation || ''}</p>
          </div>
        `).join('')}
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200/80">
        <div class="flex gap-2">
          <button type="button" id="btn-tutor-prev" class="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-outlined text-sm">arrow_back</span> Back
          </button>
          <button type="button" id="btn-tutor-repeat" class="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-outlined text-sm">replay</span> Repeat
          </button>
          <button type="button" id="btn-tutor-next" class="px-3.5 py-1.5 bg-navy-brand text-white rounded-lg text-xs font-bold hover:bg-navy-dark flex items-center gap-1 cursor-pointer">
            <span>Next</span> <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
        <button type="button" id="btn-tutor-question" class="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1 cursor-pointer">
          <span class="material-symbols-outlined text-sm">help</span> Ask Question
        </button>
      </div>
    `;

    container.appendChild(lessonCard);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    // Wire up button click controls to the exact same underlying logic as voice commands
    document.getElementById('btn-tutor-prev')?.addEventListener('click', () => this.goToPreviousStep());
    document.getElementById('btn-tutor-repeat')?.addEventListener('click', () => this.repeatCurrentStep());
    document.getElementById('btn-tutor-next')?.addEventListener('click', () => this.goToNextStep());
    document.getElementById('btn-tutor-question')?.addEventListener('click', () => this.startDoubtFlow());
  }

  highlightCurrentStepUI(stepIndex) {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    const counter = document.getElementById('lesson-step-counter');
    if (counter) {
      counter.textContent = `Step ${stepIndex + 1} of ${this.currentLesson.steps.length}`;
    }

    this.currentLesson.steps.forEach((_, idx) => {
      const el = document.getElementById(`lesson-step-item-${idx}`);
      if (el) {
        if (idx === stepIndex) {
          el.className = 'lesson-step-item p-4 rounded-xl border transition-all bg-white border-blue-500 shadow-sm ring-2 ring-blue-100';
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          el.className = 'lesson-step-item p-4 rounded-xl border transition-all bg-white/60 border-slate-200 opacity-60';
        }
      }
    });
  }
}

export const tutor = new TutorVoiceController();
