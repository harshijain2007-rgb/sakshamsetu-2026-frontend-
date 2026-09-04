/**
 * Saksham Setu Admin Dashboard Controller
 * Integrates Chart.js for analytics and renders strictly anonymized grievance tables (Secret Code only).
 * Includes inline Department dropdown with unselected/blank default when assigned_department is null.
 */
import { api } from './api.js';
import { voice } from './voice.js';
import { auth } from './auth.js';

export const dashboard = {
  charts: {},

  init: async () => {
    await dashboard.loadMetrics();
    await dashboard.loadGrievancesTable();
    dashboard.initCharts();
  },

  loadMetrics: async () => {
    try {
      const res = await api.dashboard.getAdmin();
      if (res) {
        const scoreEl = document.getElementById('metric-overall-score') || document.getElementById('metric-compliance-score');
        const openEl = document.getElementById('metric-open-grievance-count') || document.getElementById('metric-open-grievances');
        const avgDaysEl = document.getElementById('metric-average-resolution-days');
        const activeServicesEl = document.getElementById('metric-active-services-count');

        if (scoreEl && res.overall_score !== undefined) {
          scoreEl.textContent = `${res.overall_score}%`;
        }
        if (openEl && res.open_grievance_count !== undefined) {
          openEl.textContent = res.open_grievance_count;
        }
        if (avgDaysEl && res.average_resolution_days !== undefined) {
          avgDaysEl.textContent = `${res.average_resolution_days}d`;
        }
        if (activeServicesEl && res.active_services_count !== undefined) {
          activeServicesEl.textContent = res.active_services_count;
        }
      }
    } catch (err) {
      console.error('Error loading admin dashboard metrics', err);
    }
  },

  initCharts: () => {
    // Trend Line Chart
    const trendCtx = document.getElementById('complianceTrendChart');
    if (trendCtx && window.Chart) {
      dashboard.charts.trend = new window.Chart(trendCtx, {
        type: 'line',
        data: {
          labels: ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Current'],
          datasets: [{
            label: 'Institutional Accessibility Audit (%)',
            data: [72, 75, 80, 84, 86, 88],
            borderColor: '#003f87',
            backgroundColor: '#003f87',
            borderWidth: 3,
            fill: false,
            tension: 0.1,
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                font: { family: 'Lexend', size: 14, weight: '600' },
                color: '#1E293B'
              }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: { font: { family: 'Lexend', size: 12 }, color: '#475569' },
              grid: { color: '#E2E8F0' }
            },
            x: {
              ticks: { font: { family: 'Lexend', size: 12 }, color: '#475569' },
              grid: { color: '#E2E8F0' }
            }
          }
        }
      });
    }

    // Grievance Breakdown Chart
    const catCtx = document.getElementById('grievanceCategoryChart');
    if (catCtx && window.Chart) {
      dashboard.charts.category = new window.Chart(catCtx, {
        type: 'bar',
        data: {
          labels: ['Physical Ramps', 'Elevators', 'Screen Readers', 'Sign Interpreters', 'Restrooms'],
          datasets: [{
            label: 'Reported Grievances by Domain',
            data: [0, 0, 0, 0, 0],
            backgroundColor: ['#003f87', '#2e7d32', '#0284c7', '#7c3aed', '#d32f2f'],
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { family: 'Lexend', size: 12 }, color: '#475569' },
              grid: { color: '#E2E8F0' }
            },
            x: {
              ticks: { font: { family: 'Lexend', size: 12 }, color: '#475569' },
              grid: { display: false }
            }
          }
        }
      });
    }
  },

  loadGrievancesTable: async () => {
    const tableBody = document.getElementById('admin-grievance-tbody');
    if (!tableBody) return;

    try {
      const res = await api.grievances.getAllForAdmin();
      const grievances = res.grievances || res || [];

      if (Array.isArray(grievances) && grievances.length > 0) {
        tableBody.innerHTML = grievances.map(g => {
          const code = g.secret_code || g.code || g.id || 'SAK-2026-UNKNOWN';
          // Grievance queue table fix: populate from assigned_department field on row. If null/empty, leave dropdown unselected/blank (do not default to Facilities)
          const dept = (g.assigned_department !== undefined && g.assigned_department !== null) ? g.assigned_department : (g.department || '');
          const status = g.status || 'Registered';

          return `
            <tr class="border-b-2 border-border-dark hover:bg-surface-container transition-none" data-code="${code}">
              <td class="p-4 font-extrabold text-primary text-lg">
                ${code}
              </td>
              <td class="p-4 font-bold text-high-contrast-text">
                ${g.category || 'General'}
              </td>
              <td class="p-4 text-on-surface-variant font-medium">
                ${g.location || 'Campus'}
              </td>
              <td class="p-4">
                <select class="dept-select p-2 font-bold text-sm border-2 border-border-dark bg-white rounded-xl focus:outline-none focus:ring-4 focus:ring-focus-indicator" data-code="${code}">
                  <option value="" ${!dept ? 'selected' : ''}>-- Select Department --</option>
                  <option value="Facilities" ${dept === 'Facilities' ? 'selected' : ''}>Facilities</option>
                  <option value="Transport" ${dept === 'Transport' ? 'selected' : ''}>Transport</option>
                  <option value="Academic" ${dept === 'Academic' ? 'selected' : ''}>Academic</option>
                  <option value="Health" ${dept === 'Health' ? 'selected' : ''}>Health</option>
                </select>
              </td>
              <td class="p-4">
                <select class="status-select p-2 font-bold text-sm border-2 border-border-dark bg-white rounded-xl focus:outline-none focus:ring-4 focus:ring-focus-indicator" data-code="${code}">
                  <option value="Registered" ${status === 'Registered' ? 'selected' : ''}>Registered</option>
                  <option value="In Progress" ${status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                  <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                </select>
              </td>
              <td class="p-4">
                <span class="save-status-indicator text-xs font-bold text-secondary" id="saved-${code}"></span>
                <a href="admin-assign-grievance.html?code=${encodeURIComponent(code)}" class="inline-flex items-center gap-1 text-primary font-bold underline hover:text-black ml-2">
                  Details
                  <span class="material-symbols-outlined text-base">arrow_forward</span>
                </a>
              </td>
            </tr>
          `;
        }).join('');

        // Wire change handlers for department and status dropdowns (using single PATCH call)
        document.querySelectorAll('.dept-select, .status-select').forEach(sel => {
          sel.addEventListener('change', async () => {
            const code = sel.getAttribute('data-code');
            const row = sel.closest('tr');
            const deptVal = row.querySelector('.dept-select').value;
            const statusVal = row.querySelector('.status-select').value;
            const indicator = document.getElementById(`saved-${code}`);

            if (indicator) indicator.textContent = 'Updating...';

            try {
              // Single PATCH call updating both department and status in request body
              await api.grievances.update(code, {
                assigned_department: deptVal,
                department: deptVal,
                status: statusVal
              });
              if (indicator) {
                indicator.textContent = 'Saved!';
                setTimeout(() => { indicator.textContent = ''; }, 2500);
              }
              await dashboard.loadMetrics();
            } catch (err) {
              if (indicator) indicator.textContent = 'Error saving';
            }
          });
        });
      } else {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="p-8 text-center bg-surface-container text-on-surface-variant font-bold text-lg">
              No grievances filed yet. Newly submitted anonymous grievances will appear here with secret tracking codes.
            </td>
          </tr>
        `;
      }
    } catch (err) {
      console.error('Error loading grievances table', err);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  auth.initAccessibility();
  if (document.getElementById('admin-grievance-tbody') || document.getElementById('complianceTrendChart')) {
    dashboard.init();
  }
});
