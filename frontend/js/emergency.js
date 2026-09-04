/**
 * Saksham Setu Emergency Module
 * Implements the dual-trigger rule:
 * - On student-visual-dyslexic.html: Triggered by spoken command via voice.js or emergency button,
 *   calls POST /api/emergency/request with fixed { category: 'general' } and speaks contact via SpeechSynthesis.
 * - On student-hearing-physical.html: Triggered by visible tap button,
 *   calls POST /api/emergency/request with fixed { category: 'general' } and displays high-contrast visual modal.
 */

import { api } from './api.js';

export const emergency = {
  /**
   * 1. Voice-Triggered Emergency Flow (for Visual / Dyslexic Portal)
   * Fetches contact data from backend and narrates clearly using SpeechSynthesis.
   */
  triggerVoiceEmergency: async (location = 'Visual-Dyslexic Portal') => {
    try {
      // NOTE: Fixed { "category": "general" } is intentional because portals do not have a category selector, not a placeholder to revisit.
      const requestRes = await api.emergency.request();
      const res = requestRes.success ? requestRes : await api.emergency.getContact(location);

      if (res.success || res.contactName) {
        const contactName = res.contactName || 'Campus Quick Response Team';
        const phone = res.phoneNumber || '112';

        // Build spoken string
        const speechText = `Emergency assistance alert activated. Contacting ${contactName}. The direct phone number is ${phone.split('').join(' ')}. Please stay at your current location. Help is on the way.`;
        
        // Use SpeechSynthesis
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(speechText);
          utterance.rate = 0.9;
          utterance.pitch = 1.0;
          utterance.onend = () => {
            window.location.href = `tel:${phone}`;
          };
          window.speechSynthesis.speak(utterance);
        }

        // Also display prominent on-screen emergency modal & alert banner
        emergency.renderEmergencyBanner({
          contactName,
          phoneNumber: phone,
          alternateNumber: res.alternateNumber || '108',
          instructions: res.instructions || 'Stay at your current location. Campus responders are notified.'
        });
        emergency.renderHighContrastModal({
          contactName,
          phoneNumber: phone,
          alternateNumber: res.alternateNumber || '108',
          instructions: res.instructions || 'Stay at your current location. Campus responders are notified.'
        });
      }
    } catch (err) {
      console.error('[Emergency API Error]', err);
    }
  },

  /**
   * 2. Tap-Triggered Emergency Flow (for Hearing / Physical Portal)
   * Fetches contact data from backend and immediately displays a high-contrast visual modal.
   * Zero audio dependency (never relies on sound).
   */
  triggerTapEmergency: async (location = 'Hearing-Physical Portal') => {
    try {
      // NOTE: Fixed { "category": "general" } is intentional because portals do not have a category selector, not a placeholder to revisit.
      const requestRes = await api.emergency.request();
      const res = requestRes.success ? requestRes : await api.emergency.getContact(location);

      if (res.success || res.contactName) {
        emergency.renderHighContrastModal({
          contactName: res.contactName || 'Campus Quick Response Team',
          phoneNumber: res.phoneNumber || '112',
          alternateNumber: res.alternateNumber || '108',
          instructions: res.instructions || 'Stay at your current location. Campus responders are notified.'
        });
      }
    } catch (err) {
      console.error('[Emergency API Error]', err);
    }
  },

  /**
   * Renders high-contrast on-screen modal
   */
  renderHighContrastModal: (contactData) => {
    // Remove existing if any
    const existing = document.getElementById('emergency-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'emergency-modal';
    modal.className = 'emergency-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'emergency-modal-title');

    modal.innerHTML = `
      <div class="emergency-modal-content border-2 border-red-500 p-6 md:p-8 bg-white max-w-xl w-full rounded-3xl space-y-5 shadow-2xl" style="background-color: #ffffff; color: #0f172a;">
        <div class="flex items-center gap-3 border-b-2 border-red-200 pb-3" style="border-bottom-color: #fee2e2;">
          <div class="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md" style="background-color: #dc2626; color: #ffffff;">
            <span class="material-symbols-outlined text-3xl">emergency</span>
          </div>
          <div>
            <h2 id="emergency-modal-title" class="text-2xl font-extrabold text-red-600 font-heading" style="color: #dc2626;">EMERGENCY ASSISTANCE ACTIVATED</h2>
            <p class="text-xs text-slate-600 font-semibold mt-0.5">Campus Quick Response Dispatch & Security</p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="p-4 rounded-2xl border border-slate-200" style="background-color: #f8fafc; color: #0f172a;">
            <p class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Responder Team</p>
            <p class="text-lg font-extrabold text-slate-900 mt-0.5" style="color: #0f172a;">${contactData.contactName}</p>
          </div>

          <div class="p-4 rounded-2xl border-2 border-red-300" style="background-color: #fef2f2; color: #dc2626;">
            <p class="text-[10px] font-extrabold text-red-700 uppercase tracking-wider">Direct Hotline (Tap to Dial)</p>
            <p class="text-3xl font-extrabold text-red-600 mt-0.5 tracking-wider font-mono" style="color: #dc2626;">${contactData.phoneNumber}</p>
          </div>

          <div class="p-4 rounded-2xl border border-slate-200" style="background-color: #f8fafc; color: #0f172a;">
            <p class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Alternate / Ambulance</p>
            <p class="text-base font-bold text-slate-800 mt-0.5" style="color: #1e293b;">${contactData.alternateNumber || '108'}</p>
          </div>

          <div class="p-4 border-2 border-red-400 rounded-2xl text-xs font-bold leading-relaxed" style="background-color: #dc2626; color: #ffffff;">
            ⚠️ ${contactData.instructions || 'Stay at your current location. Campus medical responders and security are notified.'}
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 pt-2">
          <a href="tel:${contactData.phoneNumber}" style="background-color: #dc2626 !important; color: #ffffff !important;" class="flex-1 text-center font-extrabold py-3.5 px-6 rounded-xl shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2 text-sm">
            <span class="material-symbols-outlined text-xl">call</span>
            <span>CALL EMERGENCY (${contactData.phoneNumber})</span>
          </a>
          <button id="close-emergency-modal" style="background-color: #f1f5f9; color: #334155;" class="font-bold py-3.5 px-6 rounded-xl hover:bg-slate-200 transition-all text-sm">
            Dismiss
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = document.getElementById('close-emergency-modal');
    if (closeBtn) {
      closeBtn.focus();
      closeBtn.addEventListener('click', () => modal.remove());
    }

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.remove();
    });
  },

  renderEmergencyBanner: (contactData) => {
    const existing = document.getElementById('emergency-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'emergency-banner';
    banner.className = 'fixed bottom-4 right-4 z-50 p-5 rounded-2xl max-w-md shadow-2xl border-2 border-white';
    banner.style.cssText = 'background-color: #dc2626 !important; color: #ffffff !important; z-index: 99999;';
    
    banner.innerHTML = `
      <div class="flex items-start gap-3.5" style="color: #ffffff;">
        <div class="w-10 h-10 rounded-xl bg-white text-red-600 flex items-center justify-center shrink-0 shadow-sm" style="background-color: #ffffff; color: #dc2626;">
          <span class="material-symbols-outlined text-2xl">emergency</span>
        </div>
        <div class="space-y-1 flex-1 min-w-0" style="color: #ffffff;">
          <h3 class="text-base font-extrabold leading-tight" style="color: #ffffff;">EMERGENCY ALERT ACTIVE</h3>
          <p class="font-bold text-xs" style="color: #fef2f2;">Contact: ${contactData.contactName}</p>
          <p class="text-2xl font-mono font-extrabold tracking-wider" style="color: #ffffff;">${contactData.phoneNumber}</p>
          <div class="flex items-center gap-2 pt-1.5">
            <a href="tel:${contactData.phoneNumber}" class="text-xs font-extrabold py-1.5 px-3.5 rounded-lg shadow-sm transition-all inline-flex items-center gap-1" style="background-color: #ffffff !important; color: #dc2626 !important;">
              <span class="material-symbols-outlined text-sm">call</span>
              <span>Call Now</span>
            </a>
            <button id="close-emergency-banner" class="text-xs font-bold py-1.5 px-3 rounded-lg transition-all" style="background-color: rgba(0,0,0,0.25); color: #ffffff;">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    document.getElementById('close-emergency-banner')?.addEventListener('click', () => banner.remove());
  }
};
