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
 * - UI reflects logical voice state, NOT raw onend browser disconnects (no rapid flickering).
 * - Handles all microphone permission, continuous listening, and recovery states safely.
 */

import { api } from './api.js';

export const TUTOR_STATES = {
  IDLE: 'IDLE',
  LISTENING_FOR_TOPIC: 'LISTENING_FOR_TOPIC',
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
    this.recognitionShouldBeActive = false; // Logical expectation
    this.isRecognizing = false;             // Actual browser mic status
    this.isSpeaking = false;                // TTS active flag
    this.hasPermissionError = false;        // Fatal mic permission error
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

    this.setupLifecycleCleanups();
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
    // Stop microphone safely before speaking to prevent feedback
    this.stopRecognitionSafely(false);
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
  // 3. Isolated Tutor Speech Recognition Lifecycle & Recovery
  // =========================================================================
  initTutorRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.tutorSpeechRecognition = new SpeechRecognition();
    this.tutorSpeechRecognition.continuous = true;
    this.tutorSpeechRecognition.interimResults = true;
    this.tutorSpeechRecognition.lang = 'en-IN';
    this.tutorSpeechRecognition.maxAlternatives = 3;

    this.tutorSpeechRecognition.onstart = () => {
      this.isRecognizing = true;
      console.log('[VOICE] recognition started, mode:', this.state);
      if (this.recognitionShouldBeActive) {
        this.updateStatusBadge(true);
      }
    };

    this.tutorSpeechRecognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i][0];
        if (event.results[i].isFinal) {
          finalTranscript += item.transcript;
        } else {
          interimTranscript += item.transcript;
        }
      }

      // Display live interim speech in the status UI without triggering any action!
      if (interimTranscript && !finalTranscript) {
        const trimmedInterim = interimTranscript.trim();
        if (trimmedInterim) {
          this.updateStatusText(`Hearing: "${trimmedInterim}..."`);
        }
        return; // Reject interim command execution!
      }

      const activeText = finalTranscript.trim();
      if (!activeText) return;

      // ONLY process final speech!
      this.handleTutorSpeech(activeText, true);
    };

    this.tutorSpeechRecognition.onerror = (e) => {
      console.warn('[VOICE] error in mode:', this.state, e.error);

      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.hasPermissionError = true;
        this.recognitionShouldBeActive = false;
        this.isRecognizing = false;
        this.updateStatusBadge(false);
        const permMsg = "Microphone access is required for voice control. Please allow microphone access in your browser.";
        this.updateStatusText(permMsg);
        this.speak(permMsg);
        return;
      }

      if (e.error === 'audio-capture') {
        this.updateStatusText("No usable microphone was found. Please check your audio settings.");
        return;
      }

      // Safe debounced recovery for temporary interruptions (no-speech, network, aborted)
      if (this.recognitionShouldBeActive && !this.isSpeaking) {
        this.scheduleRestart();
      }
    };

    this.tutorSpeechRecognition.onend = () => {
      this.isRecognizing = false;
      console.log('[VOICE] recognition ended, mode:', this.state, 'shouldBeActive:', this.recognitionShouldBeActive);
      
      const shouldRestart = (
        (this.state === TUTOR_STATES.LISTENING_FOR_TOPIC ||
         this.state === TUTOR_STATES.LISTENING_FOR_COMMAND ||
         this.state === TUTOR_STATES.LISTENING_FOR_DOUBT) &&
        this.recognitionShouldBeActive &&
        !this.isSpeaking &&
        !this.hasPermissionError
      );

      if (shouldRestart) {
        this.scheduleRestart();
      } else if (!this.recognitionShouldBeActive) {
        this.updateStatusBadge(false);
      }
    };
  }

  scheduleRestart() {
    if (this.hasPermissionError || this.isSpeaking || !this.recognitionShouldBeActive || this.isRecognizing) return;

    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      const canStart = (
        (this.state === TUTOR_STATES.LISTENING_FOR_TOPIC ||
         this.state === TUTOR_STATES.LISTENING_FOR_COMMAND ||
         this.state === TUTOR_STATES.LISTENING_FOR_DOUBT) &&
        this.recognitionShouldBeActive &&
        !this.isSpeaking &&
        !this.isRecognizing &&
        !this.hasPermissionError
      );

      if (canStart) {
        try {
          if (this.tutorSpeechRecognition) {
            this.tutorSpeechRecognition.start();
          }
        } catch (err) {
          console.warn('[VOICE] restart caught:', err);
        }
      }
    }, 400);
  }

  startRecognitionSafely() {
    if (!this.hasRecognition || this.hasPermissionError || this.isSpeaking) return;
    this.recognitionShouldBeActive = true;
    this.updateStatusBadge(true);
    clearTimeout(this.restartTimer);

    if (!this.isRecognizing) {
      try {
        this.tutorSpeechRecognition.start();
      } catch (e) {
        // Already started or busy
      }
    }
  }

  startRecognition() {
    this.startRecognitionSafely();
  }

  stopRecognitionSafely(disableLogical = true) {
    clearTimeout(this.restartTimer);
    if (disableLogical) {
      this.recognitionShouldBeActive = false;
      this.updateStatusBadge(false);
    }
    if (this.tutorSpeechRecognition && this.isRecognizing) {
      try {
        this.tutorSpeechRecognition.stop();
      } catch (e) {}
    }
    this.isRecognizing = false;
  }

  stopRecognition() {
    this.stopRecognitionSafely(true);
  }

  setupUserInteractionUnlock() {
    const unlock = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      if (this.hasRecognition && this.recognitionShouldBeActive && !this.isRecognizing && !this.isSpeaking) {
        this.startRecognitionSafely();
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

    const welcomeText = "Welcome to AI Tutor! What topic would you like to learn today? Say a topic name after the tone.";
    this.updateStatusText('Welcome to AI Tutor! Say a topic name after the tone.');
    
    this.speak(welcomeText, 0.95, () => {
      this.playChime(660, 0.5);
      setTimeout(() => {
        this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
        this.startRecognitionSafely();
        this.updateStatusText('Listening for your study topic... Speak freely.');
      }, 550);
    });
  }

  // =========================================================================
  // 5. Speech Dispatcher & State Machine
  // =========================================================================
  handleTutorSpeech(transcript, isFinal = false) {
    const rawTranscript = transcript;
    const command = transcript.toLowerCase().trim().replace(/[.,!?]/g, '');

    console.log('[TUTOR] transcript:', rawTranscript);
    console.log('[TUTOR] normalized command:', command, 'mode:', this.state, 'isFinal:', isFinal);

    // -----------------------------------------------------------------------
    // State 1: Capturing Study Topic (e.g. "stacks", "binary search", "Newton Raphson")
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_TOPIC) {
      if (!command) return;

      let cleanTopic = command.replace(/^(learn|teach me|i want to learn|study|topic is|topic)\s+/i, '').trim();
      if (!cleanTopic) cleanTopic = command;

      // Only trigger once we have a clear, non-empty topic phrase
      if (cleanTopic.length >= 2) {
        console.log('[TUTOR] topic captured:', cleanTopic);
        this.currentTopic = cleanTopic;
        this.state = TUTOR_STATES.PLAYING_LESSON;
        this.stopRecognitionSafely(true);

        // Populate DOM input
        const topicInput = document.getElementById('topicInput') || document.getElementById('tutor-input');
        if (topicInput) {
          topicInput.value = cleanTopic;
        }

        this.appendUserMessage(cleanTopic);
        this.generateAndStartLesson(cleanTopic);
      }
      return;
    }

    // -----------------------------------------------------------------------
    // State 2: Capturing Spoken Doubt / Question
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_DOUBT) {
      if (!command) return;

      // When the user speaks their question
      if (command.length >= 3) {
        console.log('[TUTOR] doubt question captured:', rawTranscript);
        this.stopRecognitionSafely(true);
        this.appendUserMessage(`Question: ${rawTranscript}`);
        this.processDoubtQuestion(rawTranscript);
      }
      return;
    }

    // -----------------------------------------------------------------------
    // State 3: Listening for Navigation & Doubt Commands
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_COMMAND || this.state === TUTOR_STATES.PLAYING_LESSON) {
      // 1. Next / More / Continue / Proceed
      if (/\b(next|more|continue|proceed|go next|next step|move next)\b/i.test(command) || command.includes('next') || command.includes('more')) {
        console.log('[TUTOR] intent recognized: NEXT');
        this.goToNextStep();
        return;
      }

      // 2. Previous / Back / Prior
      if (/\b(back|previous|prev|prior|go back|previous step)\b/i.test(command) || command.includes('back') || command.includes('previous')) {
        console.log('[TUTOR] intent recognized: BACK');
        this.goToPreviousStep();
        return;
      }

      // 3. Repeat / Again / Say that again
      if (/\b(repeat|again|say that again|repeat this|repeat step|read again|replay)\b/i.test(command) || command.includes('repeat') || command.includes('again')) {
        console.log('[TUTOR] intent recognized: REPEAT');
        this.repeatCurrentStep();
        return;
      }

      // 4. Question / Doubt / Help / Explain
      if (/\b(question|doubt|ask question|help|i have a question|explain)\b/i.test(command) || command.includes('question') || command.includes('doubt')) {
        console.log('[TUTOR] intent recognized: QUESTION');
        this.startDoubtFlow();
        return;
      }

      // 5. Explicit New Topic Request
      if (command.startsWith('learn ') || command.startsWith('study ') || command.startsWith('topic ') || command.startsWith('teach me ')) {
        const newTopic = command.replace(/^(learn|study|topic|teach me)\s+/i, '').trim();
        if (newTopic) {
          console.log('[TUTOR] new topic intent:', newTopic);
          this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
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
    this.updateStatusText(`Generating lesson on "${topic}" with Gemini...`);

    try {
      const res = await api.tutor.generate(topic);
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
        this.startRecognitionSafely();
        this.updateStatusText('Say any study topic to try again.');
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

    this.updateStatusText(`Reading: ${stepTitle}`);

    this.speak(spokenText, 0.9, () => {
      this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
      this.startRecognitionSafely();
      this.updateStatusText(`Step ${this.currentStepIndex + 1} complete. Say "Next", "Back", "Repeat", or "Question".`);
    });
  }

  goToNextStep() {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    if (this.currentStepIndex < this.currentLesson.steps.length - 1) {
      this.currentStepIndex++;
      this.playCurrentStep();
    } else {
      const finishText = "You are already on the final step. Say Repeat to hear it again, or say Question to ask anything.";
      this.updateStatusText(finishText);
      this.speak(finishText, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
        this.startRecognitionSafely();
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
      this.updateStatusText(firstText);
      this.speak(firstText, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
        this.startRecognitionSafely();
      });
    }
  }

  repeatCurrentStep() {
    this.playCurrentStep();
  }

  // =========================================================================
  // 7. Voice Doubt Flow
  // =========================================================================
  startDoubtFlow() {
    this.state = TUTOR_STATES.LISTENING_FOR_DOUBT;
    this.stopRecognitionSafely(true);
    const promptText = "What is your question about this step? Speak after the tone.";
    this.updateStatusText(promptText);

    this.speak(promptText, 0.95, () => {
      this.playChime(660, 0.5);
      setTimeout(() => {
        this.state = TUTOR_STATES.LISTENING_FOR_DOUBT;
        this.startRecognitionSafely();
        this.updateStatusText('Listening for your question... Ask freely.');
      }, 550);
    });
  }

  async processDoubtQuestion(questionText) {
    this.updateStatusText('Finding explanation from Gemini...');
    const stepOrder = this.currentStepIndex + 1;
    const topic = this.currentTopic || (this.currentLesson?.topic) || 'Current Topic';

    try {
      const res = await api.tutor.doubt(topic, stepOrder, questionText);
      const answer = res?.answer || res?.explanation || `Regarding step ${stepOrder}: In simple terms, ${questionText} relates directly to core concepts.`;

      this.appendAiMessage(`<strong>Q: ${questionText}</strong><br><br>${answer}`);

      this.updateStatusText('Reading answer...');
      this.speak(answer, 0.95, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
        this.startRecognitionSafely();
        this.updateStatusText(`Answer complete. Say "Next", "Back", "Repeat", or "Question".`);
      });
    } catch (err) {
      console.error('[Tutor Doubt Error]:', err);
      const errorMsg = "Sorry, I could not answer that question right now. Please try again.";
      this.updateStatusText(errorMsg);
      this.speak(errorMsg, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
        this.startRecognitionSafely();
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

