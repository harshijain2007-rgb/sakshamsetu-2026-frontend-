/**
 * Saksham Setu AI Tutor — 100% Voice-Driven & Accessible Controller
 * Implements isolated voice state machine for hands-free interactive study:
 * 1. Initial Spoken Prompt + 500ms Chime
 * 2. Spoken Topic Capture -> /api/tutor/generate
 * 3. Automatic Step-by-Step Lesson Narration (rate = 0.9)
 * 4. Voice Navigation ("Next", "More", "Back", "Previous", "Repeat", "Again")
 * 5. Voice Doubt Flow ("Question", "Doubt", "Help") -> /api/tutor/doubt -> Spoken Answer
 * 
 * Strict isolation: Does not interfere with globalRecognition, modalRecognition, or grievance flows.
 */

import { api, apiFetch } from './api.js';

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
    this.isTutorListening = false;
    this.state = TUTOR_STATES.IDLE;
    this.restartTimer = null;
    this.audioCtx = null;

    // Active lesson data
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
    }
  }

  // =========================================================================
  // 1. Audio Chime / Tone Generator (500ms tone)
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
  // 2. Speech Synthesis Helper with Overlap Prevention
  // =========================================================================
  speak(text, rate = 0.9, onComplete = null) {
    if (!this.hasSynthesis) {
      if (onComplete) setTimeout(onComplete, 300);
      return;
    }
    this.synth.cancel(); // Prevent overlapping speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate; // 0.9 for slow, clear lesson reading
    utterance.pitch = 1.0;
    if (this.activeVoice) utterance.voice = this.activeVoice;

    utterance.onend = () => {
      if (onComplete) onComplete();
    };

    utterance.onerror = () => {
      if (onComplete) onComplete();
    };

    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (this.hasSynthesis) {
      this.synth.cancel();
    }
  }

  // =========================================================================
  // 3. Isolated Tutor Speech Recognition Lifecycle
  // =========================================================================
  initTutorRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.tutorSpeechRecognition = new SpeechRecognition();
    this.tutorSpeechRecognition.continuous = true;
    this.tutorSpeechRecognition.interimResults = false;
    this.tutorSpeechRecognition.lang = 'en-IN';

    this.tutorSpeechRecognition.onstart = () => {
      this.isTutorListening = true;
      this.updateStatusBadge(true);
      console.log('[Tutor Speech Recognition]: Active in state', this.state);
    };

    this.tutorSpeechRecognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript.trim();
      console.log(`[Tutor Heard (${this.state})]:`, transcript);
      this.handleTutorSpeech(transcript);
    };

    this.tutorSpeechRecognition.onerror = (e) => {
      console.warn('[Tutor Recognition Error]:', e.error);
      if (e.error === 'not-allowed') {
        this.isTutorListening = false;
        this.updateStatusBadge(false);
        return;
      }
      this.scheduleRestart();
    };

    this.tutorSpeechRecognition.onend = () => {
      this.isTutorListening = false;
      this.updateStatusBadge(false);
      this.scheduleRestart();
    };
  }

  scheduleRestart() {
    if (this.state !== TUTOR_STATES.IDLE) {
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        try {
          if (this.state !== TUTOR_STATES.IDLE && this.tutorSpeechRecognition) {
            this.tutorSpeechRecognition.start();
          }
        } catch (err) {}
      }, 300);
    }
  }

  startRecognition() {
    if (!this.hasRecognition) return;
    try {
      this.tutorSpeechRecognition.start();
    } catch (e) {}
  }

  stopRecognition() {
    if (this.tutorSpeechRecognition && this.isTutorListening) {
      try {
        this.tutorSpeechRecognition.stop();
      } catch (e) {}
    }
    this.isTutorListening = false;
  }

  // =========================================================================
  // 4. Initial Welcome Flow on Page Load
  // =========================================================================
  startInitialWelcome() {
    const welcomeText = "Welcome to AI Tutor! What topic would you like to learn today? Say a topic name after the tone.";
    this.updateStatusText('Welcome to AI Tutor! Say a topic name after the tone.');
    
    this.speak(welcomeText, 0.95, () => {
      this.playChime(660, 0.5);
      setTimeout(() => {
        this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
        this.startRecognition();
        this.updateStatusText('Listening for your study topic... Speak freely.');
      }, 550);
    });
  }

  // =========================================================================
  // 5. Speech Dispatcher & State Machine
  // =========================================================================
  handleTutorSpeech(transcript) {
    const text = transcript.toLowerCase().trim();

    // -----------------------------------------------------------------------
    // State 1: Capturing Study Topic
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_TOPIC) {
      if (!transcript) return;

      // Populate input field
      const topicInput = document.getElementById('topicInput') || document.getElementById('tutor-input');
      if (topicInput) {
        topicInput.value = transcript;
      }

      this.currentTopic = transcript;
      this.state = TUTOR_STATES.PLAYING_LESSON;

      const prepMsg = `Preparing your lesson on ${transcript}. Please wait a moment.`;
      this.updateStatusText(prepMsg);
      this.appendUserMessage(transcript);

      this.speak(prepMsg, 0.95, async () => {
        await this.generateAndStartLesson(transcript);
      });
      return;
    }

    // -----------------------------------------------------------------------
    // State 2: Capturing Spoken Doubt / Question
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_DOUBT) {
      if (!transcript) return;
      this.appendUserMessage(`Question: ${transcript}`);
      this.processDoubtQuestion(transcript);
      return;
    }

    // -----------------------------------------------------------------------
    // State 3: Listening for Navigation Commands
    // -----------------------------------------------------------------------
    if (this.state === TUTOR_STATES.LISTENING_FOR_COMMAND || this.state === TUTOR_STATES.PLAYING_LESSON) {
      // 1. Next / More
      if (text.includes('next') || text.includes('more') || text.includes('continue') || text.includes('proceed') || text.includes('next step')) {
        this.goToNextStep();
        return;
      }

      // 2. Previous / Back
      if (text.includes('back') || text.includes('previous') || text.includes('prior') || text.includes('prev')) {
        this.goToPreviousStep();
        return;
      }

      // 3. Repeat / Again
      if (text.includes('repeat') || text.includes('again') || text.includes('read again') || text.includes('replay')) {
        this.repeatCurrentStep();
        return;
      }

      // 4. Question / Doubt / Help
      if (text.includes('question') || text.includes('doubt') || text.includes('help') || text.includes('ask question') || text.includes('explain')) {
        this.startDoubtFlow();
        return;
      }

      // 5. New Topic
      if (text.startsWith('learn ') || text.startsWith('study ') || text.startsWith('topic ')) {
        const newTopic = text.replace(/^(learn|study|topic)\s+/i, '').trim();
        if (newTopic) {
          this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
          this.handleTutorSpeech(newTopic);
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
      const errorMsg = "Sorry, I could not prepare your lesson right now. Please try again.";
      this.updateStatusText(errorMsg);
      this.speak(errorMsg, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_TOPIC;
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
      this.updateStatusText(`Step ${this.currentStepIndex + 1} complete. Say "Next", "Back", "Repeat", or "Question".`);
    });
  }

  goToNextStep() {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    if (this.currentStepIndex < this.currentLesson.steps.length - 1) {
      this.currentStepIndex++;
      this.playCurrentStep();
    } else {
      const finishText = "You have completed all steps in this lesson! Say Question to ask anything, or say a new topic.";
      this.updateStatusText(finishText);
      this.speak(finishText, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
      });
    }
  }

  goToPreviousStep() {
    if (!this.currentLesson || !this.currentLesson.steps) return;
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.playCurrentStep();
    } else {
      this.speak("You are at the first step of this lesson.", 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
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
    const promptText = "What is your question about this step? Speak after the tone.";
    this.updateStatusText(promptText);

    this.speak(promptText, 0.95, () => {
      this.playChime(660, 0.5);
      setTimeout(() => {
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
        this.updateStatusText(`Answer complete. Say "Next", "Back", "Repeat", or "Question".`);
      });
    } catch (err) {
      console.error('[Tutor Doubt Error]:', err);
      const errorMsg = "Sorry, I could not answer that question right now. Please try again.";
      this.updateStatusText(errorMsg);
      this.speak(errorMsg, 0.9, () => {
        this.state = TUTOR_STATES.LISTENING_FOR_COMMAND;
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
          <div id="lesson-step-item-${idx}" class="lesson-step-item p-4 rounded-xl border transition-all ${idx === 0 ? 'bg-white border-blue-500 shadow-sm' : 'bg-white/60 border-slate-200 opacity-70'}">
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
          <button type="button" id="btn-tutor-prev" class="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">arrow_back</span> Back
          </button>
          <button type="button" id="btn-tutor-repeat" class="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">replay</span> Repeat
          </button>
          <button type="button" id="btn-tutor-next" class="px-3.5 py-1.5 bg-navy-brand text-white rounded-lg text-xs font-bold hover:bg-navy-dark flex items-center gap-1">
            <span>Next</span> <span class="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
        <button type="button" id="btn-tutor-question" class="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1">
          <span class="material-symbols-outlined text-sm">help</span> Ask Question
        </button>
      </div>
    `;

    container.appendChild(lessonCard);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    // Wire up button click controls as fallback for voice
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
