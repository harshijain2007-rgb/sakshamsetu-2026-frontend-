/**
 * Saksham Setu Grievance Module
 * Implements strict grievance anonymity and secret-code tracking rules.
 * Tracker uses unauthenticated apiFetch with requireAuth = false.
 */
import { api } from './api.js';

export const grievance = {
  init: () => {
    grievance.initForm();
    grievance.initTracker();
  },

  initForm: () => {
    const form = document.getElementById('grievanceForm') || document.getElementById('grievance-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]') || document.getElementById('submit-grievance-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin">progress_activity</span> Registering Anonymously...`;
      }

      const formData = {
        category: form.category ? form.category.value : 'Physical Barrier',
        location: form.location ? form.location.value : '',
        urgency: form.urgency ? form.urgency.value : 'Normal',
        description: form.description ? form.description.value : '',
        department: form.department ? form.department.value : null
      };

      try {
        const res = await api.grievances.submit(formData);
        if (res.success || res.secretCode || res.secret_code) {
          const code = res.secretCode || res.secret_code || res.code;
          grievance.showConfirmation(code, res.grievance || formData);
          form.reset();
        } else {
          alert('Submission error: ' + (res.message || 'Please check all required fields.'));
        }
      } catch (err) {
        console.error('Submission failed', err);
        alert('Network error. Failed to lodge grievance.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span class="material-symbols-outlined text-2xl">send</span><span>Submit Anonymous Grievance</span>`;
        }
      }
    });
  },

  showConfirmation: (secretCode, grievanceData) => {
    const banner = document.getElementById('code-success-banner');
    const codeEl = document.getElementById('generated-secret-code');
    const copyBtn = document.getElementById('copy-code-btn');

    if (banner && codeEl) {
      codeEl.textContent = secretCode;
      banner.classList.remove('hidden');
      banner.scrollIntoView({ behavior: 'smooth' });

      copyBtn?.addEventListener('click', () => {
        navigator.clipboard.writeText(secretCode).then(() => {
          const label = document.getElementById('copy-btn-label');
          if (label) label.textContent = 'Code Copied!';
          setTimeout(() => {
            if (label) label.textContent = 'Copy Secret Code';
          }, 3000);
        });
      });
    }
  },

  initTracker: () => {
    const trackForm = document.getElementById('trackForm') || document.getElementById('lookup-form');
    if (!trackForm) return;

    trackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('track-code-input') || document.getElementById('lookup-code-input');
      if (!input || !input.value.trim()) return;
      await grievance.track(input.value.trim());
    });
  },

  track: async (secretCode) => {
    const resultContainer = document.getElementById('track-result-container') || document.getElementById('tracking-result-container');
    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = `
      <div class="p-6 border-2 border-border-dark bg-surface-container rounded-2xl text-center">
        <p class="text-lg font-bold">Looking up secret code: <span class="text-primary">${secretCode}</span>...</p>
      </div>
    `;

    try {
      const res = await api.grievances.trackByCode(secretCode);
      if (res.success && res.grievance) {
        grievance.renderTimeline(res.grievance, resultContainer);
      } else {
        resultContainer.innerHTML = `
          <div class="p-6 border-2 border-emergency-red bg-error-container text-emergency-red rounded-2xl">
            <h3 class="text-xl font-extrabold flex items-center gap-2">
              <span class="material-symbols-outlined">error</span>
              Code Not Found
            </h3>
            <p class="mt-1 text-sm font-bold text-high-contrast-text">No grievance matching "${secretCode}" was found. Please verify the secret code format (e.g. SAK-2026-XXXX).</p>
          </div>
        `;
      }
    } catch (err) {
      resultContainer.innerHTML = `
        <div class="p-6 border-2 border-emergency-red bg-error-container text-emergency-red rounded-2xl">
          <p class="text-base font-bold">Error loading tracking status. Please try again.</p>
        </div>
      `;
    }
  },

  renderTimeline: (item, container) => {
    const status = item.status || 'Registered';
    const dept = item.assigned_department || item.department || 'Unassigned';
    const code = item.secret_code || item.code || item.id;
    const timeline = item.timeline || [
      { title: 'Registered & Anonymous Token Assigned', time: 'Completed', completed: true },
      { title: 'Under Department Assessment', time: status === 'Registered' ? 'In Progress' : 'Completed', completed: status !== 'Registered' },
      { title: 'Action Scheduled / Remediation Dispatched', time: status === 'In Progress' ? 'In Progress' : (status === 'Resolved' ? 'Completed' : 'Pending'), completed: status === 'Resolved' },
      { title: 'Resolution Verified', time: status === 'Resolved' ? 'Verified' : 'Pending', completed: status === 'Resolved' }
    ];

    let timelineHtml = timeline.map((step, idx) => `
      <li class="relative pb-6 ${idx === timeline.length - 1 ? 'pb-0' : ''}">
        <div class="absolute top-4 left-4 -ml-0.5 h-full w-0.5 ${step.completed ? 'bg-secondary' : 'bg-slate-300'}"></div>
        <div class="relative flex items-start gap-4">
          <span class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-border-dark ${step.completed ? 'bg-secondary text-white' : 'bg-white text-on-surface-variant'} font-bold text-sm">
            ${step.completed ? '✓' : idx + 1}
          </span>
          <div class="flex min-w-0 flex-1 justify-between gap-4 pt-1">
            <div>
              <p class="text-base font-bold ${step.completed ? 'text-high-contrast-text' : 'text-on-surface-variant'}">${step.title}</p>
              <p class="text-xs font-semibold text-on-surface-variant mt-0.5">${step.time}</p>
            </div>
            <div>
              <span class="px-2.5 py-0.5 text-xs font-bold rounded-full border ${step.completed ? 'bg-secondary-container text-secondary border-secondary' : 'bg-surface-container text-on-surface-variant border-border-dark'}">
                ${step.completed ? 'COMPLETED' : 'PENDING'}
              </span>
            </div>
          </div>
        </div>
      </li>
    `).join('');

    container.innerHTML = `
      <div class="border-2 border-border-dark bg-white rounded-3xl p-6 md:p-8 space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b-2 border-border-dark pb-4">
          <div>
            <span class="text-xs font-bold text-on-surface-variant uppercase tracking-wider block">Secret Tracking Code</span>
            <h3 class="text-2xl font-extrabold text-primary">${code}</h3>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-on-surface-variant">Live Status:</span>
            <span class="px-3 py-1 text-sm font-extrabold rounded-full ${status === 'Resolved' ? 'bg-secondary text-white' : 'bg-primary text-white'}">
              ${status}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 bg-background border border-border-dark rounded-2xl">
            <span class="text-xs font-bold text-on-surface-variant block">Barrier Category</span>
            <span class="text-base font-bold text-high-contrast-text">${item.category || 'General'}</span>
          </div>
          <div class="p-4 bg-background border border-border-dark rounded-2xl">
            <span class="text-xs font-bold text-on-surface-variant block">Reported Location</span>
            <span class="text-base font-bold text-high-contrast-text">${item.location || 'Campus'}</span>
          </div>
          <div class="p-4 bg-background border border-border-dark rounded-2xl">
            <span class="text-xs font-bold text-on-surface-variant block">Assigned Department</span>
            <span class="text-base font-bold text-high-contrast-text">${dept}</span>
          </div>
        </div>

        <div class="p-4 border border-border-dark bg-white rounded-2xl">
          <span class="text-xs font-bold text-on-surface-variant block mb-1">Issue Description</span>
          <p class="text-sm text-high-contrast-text font-medium">${item.description || 'No additional details.'}</p>
        </div>

        <div class="pt-4 border-t-2 border-border-dark">
          <h4 class="text-xl font-bold text-primary mb-4">Resolution Progress Timeline</h4>
          <ul class="space-y-1">
            ${timelineHtml}
          </ul>
        </div>
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  grievance.init();
});
