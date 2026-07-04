// Backup & Restore page. Runs in a normal extension tab (not the popup), so the
// file picker works reliably — a file dialog opened from a browser-action popup
// would close the popup and abort the import.
document.addEventListener('DOMContentLoaded', function() {

  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const statusDiv = document.getElementById('status');
  const countDiv = document.getElementById('count');
  const zapRadios = document.querySelectorAll('input[name="zapLevel"]');

  updateCount();
  initZapLevel();

  // Load the saved zap level and persist changes
  function initZapLevel() {
    browser.storage.local.get('zapLevel').then(function(res) {
      const level = res.zapLevel || 'duplicates';
      zapRadios.forEach(function(radio) {
        radio.checked = (radio.value === level);
      });
    });
    zapRadios.forEach(function(radio) {
      radio.addEventListener('change', function() {
        if (radio.checked) browser.storage.local.set({ zapLevel: radio.value });
      });
    });
  }

  exportBtn.addEventListener('click', exportSessions);

  importBtn.addEventListener('click', function() {
    importFile.value = ''; // allow re-importing the same file name
    importFile.click();
  });
  importFile.addEventListener('change', function() {
    if (importFile.files && importFile.files.length > 0) {
      importSessions(importFile.files[0]);
    }
  });

  function setStatus(message, kind) {
    statusDiv.textContent = message;
    statusDiv.className = kind || '';
  }

  // Show how many sessions are currently stored
  function updateCount() {
    browser.storage.local.get('savedSessions')
      .then(function(result) {
        const n = (result.savedSessions || []).length;
        countDiv.textContent = `You currently have ${n} saved session${n === 1 ? '' : 's'}.`;
      });
  }

  // Build a canonical key for a session: name + its tab URLs (order-independent).
  // Two sessions with the same name and the same set of tab URLs are treated as
  // the same, regardless of when they were saved (the `date` field is ignored).
  function sessionKey(session) {
    const urls = (session.tabs || [])
      .map(tab => tab.url)
      .sort();
    return JSON.stringify([session.name, urls]);
  }

  // Export all saved sessions to a downloadable JSON file
  function exportSessions() {
    browser.storage.local.get('savedSessions')
      .then(function(result) {
        const savedSessions = result.savedSessions || [];

        if (savedSessions.length === 0) {
          setStatus('No sessions to export.', 'err');
          return;
        }

        const json = JSON.stringify(savedSessions, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Date-stamped filename, e.g. tab-sessions-2026-07-03.json
        const stamp = new Date().toISOString().slice(0, 10);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tab-sessions-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        setStatus(`Exported ${savedSessions.length} session${savedSessions.length === 1 ? '' : 's'}.`, 'ok');
      })
      .catch(function(error) {
        console.error('Error exporting sessions:', error);
        setStatus('Error exporting sessions.', 'err');
      });
  }

  // Import sessions from a JSON file, merging into existing ones.
  // Existing sessions are never removed; imported sessions that duplicate an
  // existing one (same name + same tabs) are skipped, as are duplicates within
  // the imported file itself.
  function importSessions(file) {
    const reader = new FileReader();

    reader.onload = function() {
      let imported;
      try {
        imported = JSON.parse(reader.result);
      } catch (e) {
        setStatus('Import failed: file is not valid JSON.', 'err');
        return;
      }

      if (!Array.isArray(imported)) {
        setStatus('Import failed: expected a list of sessions.', 'err');
        return;
      }

      // Keep only entries that look like sessions (name + tabs array)
      const valid = imported.filter(s =>
        s && typeof s.name === 'string' && Array.isArray(s.tabs));

      if (valid.length === 0) {
        setStatus('Import failed: no valid sessions found in file.', 'err');
        return;
      }

      browser.storage.local.get('savedSessions')
        .then(function(result) {
          const savedSessions = result.savedSessions || [];

          // Seed the seen-set with keys of everything already stored
          const seen = new Set(savedSessions.map(sessionKey));

          let added = 0;
          let skipped = 0;
          valid.forEach(session => {
            const key = sessionKey(session);
            if (seen.has(key)) {
              skipped++;
              return;
            }
            seen.add(key);
            savedSessions.push(session);
            added++;
          });

          return browser.storage.local.set({ savedSessions }).then(function() {
            updateCount();
            setStatus(`Imported ${added}, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.`, 'ok');
          });
        })
        .catch(function(error) {
          console.error('Error importing sessions:', error);
          setStatus('Error importing sessions.', 'err');
        });
    };

    reader.onerror = function() {
      setStatus('Error reading file.', 'err');
    };

    reader.readAsText(file);
  }
});
