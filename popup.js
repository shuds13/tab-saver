// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {

  // Create a dedicated container for Undo messages so they persist even when there are no sessions
  const undoContainer = document.getElementById('undoContainer');

  // Get references to DOM elements
  const sessionNameInput = document.getElementById('sessionName');
  const saveButton = document.getElementById('saveBtn');
  const sessionsListDiv = document.getElementById('sessionsList');

  // Add status display element below the input+button row but before "Saved Sessions" heading
  const saveStatusDiv = document.createElement('div');
  saveStatusDiv.id = 'saveStatus';
  saveStatusDiv.style.marginTop = '5px';
  saveStatusDiv.style.color = '#666';
  // Insert it right after the div containing the input and save button
  saveButton.parentNode.after(saveStatusDiv);

  // Gear icon: open the Backup & Restore page in a tab.
  // A file picker can't be used directly from a browser-action popup — opening
  // one closes the popup and its scripts stop running — so import/export live
  // on a dedicated page (options.html) instead.
  const settingsBtn = document.getElementById('settingsBtn');
  const zapBtn = document.getElementById('zapBtn');

  // Initialize by loading saved sessions
  loadAndDisplaySessions();
  updateSaveStatus();

  settingsBtn.addEventListener('click', function() {
    browser.runtime.openOptionsPage();
    window.close(); // close the popup so the page has focus
  });

  // Zap: close duplicate tabs in the current window
  zapBtn.addEventListener('click', zapDuplicateTabs);

  // Close any open row menu when clicking outside a trigger or menu
  document.addEventListener('click', function(event) {
    if (!event.target.closest('.options-trigger') && !event.target.closest('.row-menu')) {
      closeAllRowMenus();
    }
  });

  // Hide every open per-row action menu
  function closeAllRowMenus() {
    sessionsListDiv.querySelectorAll('.row-menu').forEach(function(menu) {
      menu.style.display = 'none';
    });
  }

  // Add event listener to the save button
  saveButton.addEventListener('click', function() {
    // Only proceed if there's text in the input field
    if (sessionNameInput.value.trim() !== '') {
      saveCurrentSession();
    }
  });

  // Handle Enter key in the input field
  sessionNameInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission
      // Only proceed if there's text in the input field
      if (sessionNameInput.value.trim() !== '') {
        saveCurrentSession();
      }
    }
  });

  // Simple function to update status text
  function updateSaveStatus() {
    // First check for highlighted tabs (selected tabs)
    browser.tabs.query({currentWindow: true, highlighted: true})
      .then(function(highlightedTabs) {
        if (highlightedTabs.length > 1) {
          saveStatusDiv.textContent = `Will save ${highlightedTabs.length} selected tabs`;
        } else {
          // If no selection, will save all tabs
          browser.tabs.query({currentWindow: true})
            .then(function(allTabs) {
              saveStatusDiv.textContent = `Will save all ${allTabs.length} tabs`;
            });
        }
      });
  }

  // Function to save current window's tabs
  function saveCurrentSession() {
    const sessionName = sessionNameInput.value.trim();

    if (!sessionName) {
      // Skip saving if no name provided - no alert window
      return;
    }

    // First determine if we have selected tabs
    browser.tabs.query({currentWindow: true, highlighted: true})
      .then(function(highlightedTabs) {
        let tabsPromise;

        if (highlightedTabs.length > 1) {
          // Use selected tabs
          tabsPromise = Promise.resolve(highlightedTabs);
        } else {
          // Use all tabs
          tabsPromise = browser.tabs.query({currentWindow: true});
        }

        return tabsPromise;
      })
      .then(function(tabsToSave) {
        // Extract needed tab information
        const tabsData = tabsToSave.map(tab => ({
          url: tab.url,
          title: tab.title
        }));

        // Create session object
        const sessionData = {
          name: sessionName,
          date: new Date().toISOString(),
          tabs: tabsData,
          // Flag if this was selected tabs
          selectedOnly: tabsToSave.length > 1 && tabsToSave.some(tab => !tab.highlighted)
        };

        // Get existing saved sessions
        return browser.storage.local.get('savedSessions')
          .then(function(result) {
            // Get existing sessions or initialize empty array
            const savedSessions = result.savedSessions || [];

            // Add new session to the beginning of the array
            savedSessions.unshift(sessionData);

            // Save updated sessions array
            return browser.storage.local.set({ savedSessions: savedSessions });
          });
      })
      .then(function() {
        // Clear input field
        sessionNameInput.value = '';

        // Update status
        updateSaveStatus();

        // Reload sessions list
        loadAndDisplaySessions();


        console.log('Session saved successfully');
      })
      .catch(function(error) {
        console.error('Error saving session:', error);
        // Use a non-blocking notification instead of alert
        const errorNotice = document.createElement('div');
        errorNotice.textContent = 'Error saving session';
        errorNotice.style.color = 'red';
        errorNotice.style.padding = '5px';
        saveStatusDiv.parentNode.insertBefore(errorNotice, saveStatusDiv.nextSibling);
        setTimeout(() => errorNotice.remove(), 3000);
      });
  }

  // Function to load and display saved sessions
  function loadAndDisplaySessions() {
    // Clear the list
    sessionsListDiv.innerHTML = '';

    // Get saved sessions from storage
    browser.storage.local.get('savedSessions')
      .then(function(result) {
        const savedSessions = result.savedSessions || [];

        console.log('Loaded sessions:', savedSessions);

        if (savedSessions.length === 0) {
          sessionsListDiv.textContent = 'No saved sessions yet';
          return;
        }

        // Create list
        const sessionList = document.createElement('ul');
        sessionList.style.listStyleType = 'none';
        sessionList.style.padding = '0';

        // Add each session to the list
        savedSessions.forEach((session, index) => {
          const listItem = document.createElement('li');
          listItem.className = 'session-item';

          // Top row: session name + Options button
          const row = document.createElement('div');
          row.className = 'session-row';

          // Session name — click to open in a new window
          const sessionInfo = document.createElement('div');
          sessionInfo.className = 'session-name';
          sessionInfo.textContent = `${session.name} (${session.tabs.length} tabs)`;
          sessionInfo.title = 'Open in a new window';
          sessionInfo.addEventListener('click', function() {
            openSessionInNewWindow(index);
          });

          // Options button (⋮) toggles this row's action menu
          const optionsButton = document.createElement('button');
          optionsButton.className = 'options-trigger';
          optionsButton.textContent = '⋮';
          optionsButton.title = 'Actions';
          optionsButton.setAttribute('aria-label', 'Session actions');

          // The action menu (rendered inline so it can't clip at the popup edge)
          const menu = document.createElement('div');
          menu.className = 'row-menu';

          function addMenuItem(label, title, onClick, extraClass) {
            const item = document.createElement('button');
            item.textContent = label;
            if (title) item.title = title;
            if (extraClass) item.className = extraClass;
            item.addEventListener('click', onClick);
            menu.appendChild(item);
            return item;
          }

          // Explore panel: a collapsible list of this session's tabs, shown in
          // the menu right under Explore. The Explore item toggles it; the menu
          // stays open.
          const explorePanel = document.createElement('div');
          explorePanel.className = 'explore-panel';

          session.tabs.forEach(function(t) {
            const tabItem = document.createElement('div');
            tabItem.className = 'explore-tab';
            tabItem.textContent = t.title || t.url;
            tabItem.title = t.url;
            tabItem.addEventListener('click', function() {
              browser.tabs.create({ url: t.url, active: false })
                .catch(error => console.error('Error opening tab:', error));
            });
            explorePanel.appendChild(tabItem);
          });

          const exploreItem = addMenuItem('Explore  ▸',
            "List this session's tabs to open individually",
            function() {
              const isOpen = explorePanel.style.display === 'block';
              explorePanel.style.display = isOpen ? 'none' : 'block';
              exploreItem.textContent = isOpen ? 'Explore  ▸' : 'Explore  ▾';
            });
          menu.appendChild(explorePanel);

          // Refresh this row in place (name/count + explore list) without
          // rebuilding the whole list, so the menu stays open after add/overwrite.
          // If prevUrls is given, any tab whose URL isn't in it is briefly
          // flashed so you can see what was just added.
          function refreshRow(prevUrls) {
            return browser.storage.local.get('savedSessions').then(function(result) {
              const list = result.savedSessions || [];
              const s = list[index];
              if (!s) return;
              sessionInfo.textContent = `${s.name} (${s.tabs.length} tabs)`;
              explorePanel.innerHTML = '';
              s.tabs.forEach(function(t) {
                const tabItem = document.createElement('div');
                tabItem.className = 'explore-tab';
                if (prevUrls && !prevUrls.has(t.url)) {
                  tabItem.classList.add('explore-tab-new');
                }
                tabItem.textContent = t.title || t.url;
                tabItem.title = t.url;
                tabItem.addEventListener('click', function() {
                  browser.tabs.create({ url: t.url, active: false })
                    .catch(error => console.error('Error opening tab:', error));
                });
                explorePanel.appendChild(tabItem);
              });
            });
          }

          // URLs currently shown, captured before an add so we can flash new ones
          function currentExploreUrls() {
            return new Set(Array.from(explorePanel.children).map(el => el.title));
          }

          addMenuItem('Add current tab',
            'Add only the active tab to this session',
            function() {
              const before = currentExploreUrls();
              addCurrentTabToSession(index).then(function() { return refreshRow(before); });
            }, 'menu-sep');
          addMenuItem('Add all tabs',
            "Add this window's open tabs to this session (or just the tabs you've selected), skipping any already saved",
            function() {
              const before = currentExploreUrls();
              addTabsToSession(index).then(function() { return refreshRow(before); });
            });
          // Destructive actions, separated and shown in red
          addMenuItem('Overwrite',
            "Replace this session's tabs with this window's tabs",
            function() { overwriteSession(index).then(refreshRow); }, 'danger menu-sep');
          addMenuItem('Delete',
            'Delete this session',
            function() { deleteSession(index); }, 'danger');

          optionsButton.addEventListener('click', function() {
            const isOpen = menu.style.display === 'block';
            closeAllRowMenus();
            if (!isOpen) menu.style.display = 'block';
          });

          row.appendChild(sessionInfo);
          row.appendChild(optionsButton);
          listItem.appendChild(row);
          listItem.appendChild(menu);
          sessionList.appendChild(listItem);
        });

        // Add list to the sessions div
        sessionsListDiv.appendChild(sessionList);
      })
      .catch(function(error) {
        console.error('Error loading sessions:', error);
        sessionsListDiv.textContent = 'Error loading sessions';
      });
  }

  // Move the session at the given index to the top of the saved list, so the
  // most recently opened sessions surface first next time the popup is opened.
  function moveSessionToTop(index) {
      return browser.storage.local.get('savedSessions')
          .then(result => {
              const savedSessions = result.savedSessions || [];
              if (index < 0 || index >= savedSessions.length) return;
              const [session] = savedSessions.splice(index, 1);
              savedSessions.unshift(session);
              return browser.storage.local.set({ savedSessions });
          })
          .then(() => loadAndDisplaySessions())
          .catch(error => console.error('Error reordering sessions:', error));
  }

  // Function to open a session in a new window (reads fresh from storage by
  // index so it reflects any in-place updates).
  function openSessionInNewWindow(index) {
      browser.storage.local.get('savedSessions')
          .then(function(result) {
              const session = (result.savedSessions || [])[index];
              if (!session || !session.tabs || session.tabs.length === 0) {
                  showNotice('This session has no tabs to open', true);
                  return;
              }
              // Bring this session to the top now that it's being opened
              moveSessionToTop(index);
              // Create a new window with ALL saved tabs at once; filter out
              // about: URLs as they may cause issues
              const allUrls = session.tabs.map(tab => tab.url).filter(url => !url.startsWith('about:'));
              return browser.windows.create({ url: allUrls }).then(function(newWindow) {
                  console.log('Created new window with ID:', newWindow.id);
              });
          })
          .catch(function(error) {
              console.error('Error opening session:', error);
              showNotice('Error opening session', true);
          });
  }

  // Show a brief, non-blocking notice above the sessions list.
  function showNotice(message, isError) {
      const notice = document.createElement('div');
      notice.textContent = message;
      notice.style.color = isError ? '#a4000f' : '#12622b';
      notice.style.padding = '5px';
      sessionsListDiv.parentNode.insertBefore(notice, sessionsListDiv);
      setTimeout(() => notice.remove(), 3000);
  }

  // Normalise a URL so near-duplicates match: drop the #fragment, common
  // tracking params, and a trailing slash.
  function normalizeUrl(url) {
      try {
          const u = new URL(url);
          u.hash = '';
          ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
           'fbclid', 'gclid', 'ref', 'ref_src'].forEach(p => u.searchParams.delete(p));
          return u.toString().replace(/\/$/, '');
      } catch (e) {
          return url; // non-standard URLs (about:, etc.) compared as-is
      }
  }

  // Zap: close exact + near-duplicate tabs in the current window, keeping the
  // first occurrence of each. Pinned tabs are always kept.
  function zapDuplicateTabs() {
      browser.tabs.query({ currentWindow: true })
          .then(function(tabs) {
              const seen = new Set();
              const toClose = [];
              tabs.forEach(function(tab) {
                  const key = normalizeUrl(tab.url);
                  if (tab.pinned) {
                      seen.add(key); // keep pinned tabs, but let them absorb dupes
                      return;
                  }
                  if (seen.has(key)) {
                      toClose.push(tab.id);
                  } else {
                      seen.add(key);
                  }
              });

              if (toClose.length === 0) {
                  showNotice('No duplicate tabs to zap');
                  return;
              }
              return browser.tabs.remove(toClose).then(function() {
                  showNotice(`Zapped ${toClose.length} duplicate tab${toClose.length === 1 ? '' : 's'}`);
              });
          })
          .catch(function(error) {
              console.error('Error zapping tabs:', error);
              showNotice('Error zapping tabs', true);
          });
  }

  // Get the tabs that Update should use, mirroring Save: the highlighted tabs
  // if more than one is selected, otherwise every tab in the current window.
  function queryTabsToSave() {
      return browser.tabs.query({ currentWindow: true, highlighted: true })
          .then(function(highlightedTabs) {
              if (highlightedTabs.length > 1) return highlightedTabs;
              return browser.tabs.query({ currentWindow: true });
          });
  }

  // Overwrite: replace a session's tabs with the current window's tabs.
  function overwriteSession(index) {
      return queryTabsToSave()
          .then(function(tabs) {
              const tabsData = tabs.map(tab => ({ url: tab.url, title: tab.title }));
              return browser.storage.local.get('savedSessions').then(function(result) {
                  const savedSessions = result.savedSessions || [];
                  if (index < 0 || index >= savedSessions.length) return;
                  const session = savedSessions[index];
                  const name = session.name;
                  // Keep the pre-overwrite state so it can be restored via Undo
                  const previousTabs = session.tabs;
                  const previousDate = session.date;
                  session.tabs = tabsData;
                  session.date = new Date().toISOString();
                  return browser.storage.local.set({ savedSessions }).then(function() {
                      showUndo(`Overwrote "${name}" — now ${tabsData.length} tab${tabsData.length === 1 ? '' : 's'}.`, function() {
                          return browser.storage.local.get('savedSessions').then(function(result2) {
                              const list = result2.savedSessions || [];
                              if (index < 0 || index >= list.length) return;
                              list[index].tabs = previousTabs;
                              list[index].date = previousDate;
                              return browser.storage.local.set({ savedSessions: list });
                          });
                      });
                  });
              });
          })
          .catch(function(error) {
              console.error('Error overwriting session:', error);
              showNotice('Error updating session', true);
          });
  }

  // Merge a list of tabs into a session, skipping URLs it already has.
  function mergeTabsIntoSession(index, tabsData) {
      return browser.storage.local.get('savedSessions').then(function(result) {
          const savedSessions = result.savedSessions || [];
          if (index < 0 || index >= savedSessions.length) return;
          const session = savedSessions[index];
          const existingUrls = new Set((session.tabs || []).map(tab => tab.url));
          let added = 0;
          let skipped = 0;
          tabsData.forEach(function(tab) {
              if (existingUrls.has(tab.url)) {
                  skipped++;
                  return;
              }
              existingUrls.add(tab.url);
              session.tabs.push(tab);
              added++;
          });
          session.date = new Date().toISOString();
          return browser.storage.local.set({ savedSessions }).then(function() {
              showNotice(`Added ${added} tab${added === 1 ? '' : 's'} to "${session.name}"` +
                  (skipped ? `, skipped ${skipped} already saved` : ''));
          });
      });
  }

  // Add tabs: merge the current window's tabs into a session.
  function addTabsToSession(index) {
      return queryTabsToSave()
          .then(tabs => mergeTabsIntoSession(index, tabs.map(tab => ({ url: tab.url, title: tab.title }))))
          .catch(function(error) {
              console.error('Error adding tabs to session:', error);
              showNotice('Error adding tabs', true);
          });
  }

  // Add current tab: merge only the active tab of the current window.
  function addCurrentTabToSession(index) {
      return browser.tabs.query({ currentWindow: true, active: true })
          .then(tabs => mergeTabsIntoSession(index, tabs.map(tab => ({ url: tab.url, title: tab.title }))))
          .catch(function(error) {
              console.error('Error adding current tab to session:', error);
              showNotice('Error adding current tab', true);
          });
  }

  // Variable to store the timeout ID for auto-removing undo message
  let undoTimeoutId = null;

  // Function to delete a session
  function deleteSession(index) {
      browser.storage.local.get('savedSessions')
          .then(result => {
              let savedSessions = result.savedSessions || [];
              const deletedSession = savedSessions[index]; // Store deleted session

              // Remove the session from the list
              savedSessions.splice(index, 1);
              return browser.storage.local.set({ savedSessions }).then(() => {
                  loadAndDisplaySessions();
                  // Offer to undo by reinserting the session at its original position
                  showUndo(`Session "${deletedSession.name}" deleted.`, function() {
                      return browser.storage.local.get('savedSessions').then(result => {
                          const list = result.savedSessions || [];
                          list.splice(index, 0, deletedSession);
                          return browser.storage.local.set({ savedSessions: list });
                      });
                  });
              });
          })
          .catch(error => {
              console.error('Error deleting session:', error);
              // Use non-blocking notification instead of alert
              const errorNotice = document.createElement('div');
              errorNotice.textContent = 'Error deleting session';
              errorNotice.style.color = 'red';
              errorNotice.style.padding = '5px';
              sessionsListDiv.parentNode.insertBefore(errorNotice, sessionsListDiv);
              setTimeout(() => errorNotice.remove(), 3000);
          });
  }

  // Show an inline Undo message with a button that runs onUndo (which returns a
  // promise) when clicked. Auto-dismisses after 5 seconds.
  function showUndo(message, onUndo) {
      const undoContainer = document.getElementById('undoContainer');

      // Clear previous undo messages
      undoContainer.innerHTML = '';

      // If there was a previous timeout, clear it
      if (undoTimeoutId) {
          clearTimeout(undoTimeoutId);
      }

      // Create undo message
      const undoMessage = document.createElement('div');
      undoMessage.textContent = message + ' ';
      undoMessage.style.marginTop = '10px';
      undoMessage.style.color = '#ff0000';

      // Create undo button
      const undoButton = document.createElement('button');
      undoButton.textContent = 'Undo';
      undoButton.style.marginLeft = '5px';
      undoButton.style.padding = '2px 6px';
      undoButton.style.backgroundColor = '#0060df';
      undoButton.style.color = '#fff';
      undoButton.style.border = 'none';
      undoButton.style.cursor = 'pointer';

      // Run the caller's undo action, then refresh the UI
      undoButton.addEventListener('click', function () {
          Promise.resolve(onUndo())
              .then(() => {
                  loadAndDisplaySessions();
                  undoMessage.remove();
              })
              .catch(error => {
                  console.error('Error undoing action:', error);
              });
      });

      // Add Undo button to the UI
      undoMessage.appendChild(undoButton);
      undoContainer.appendChild(undoMessage);

      // Auto-remove the Undo option after 5 seconds
      undoTimeoutId = setTimeout(() => {
          if (undoMessage.parentNode) {
              undoMessage.remove();
          }
      }, 5000);
  }
});
