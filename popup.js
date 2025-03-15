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

  // Initialize by loading saved sessions
  loadAndDisplaySessions();
  updateSaveStatus();

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
    chrome.tabs.query({currentWindow: true, highlighted: true}, function(highlightedTabs) {
      if (highlightedTabs.length > 1) {
        saveStatusDiv.textContent = `Will save ${highlightedTabs.length} selected tabs`;
      } else {
        // If no selection, will save all tabs
        chrome.tabs.query({currentWindow: true}, function(allTabs) {
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
    chrome.tabs.query({currentWindow: true, highlighted: true}, function(highlightedTabs) {
      if (highlightedTabs.length > 1) {
        // Use selected tabs
        processTabs(highlightedTabs, true);
      } else {
        // Use all tabs
        chrome.tabs.query({currentWindow: true}, function(allTabs) {
          processTabs(allTabs, false);
        });
      }
    });

    function processTabs(tabsToSave, selectedOnly) {
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
        selectedOnly: selectedOnly
      };

      // Get existing saved sessions
      chrome.storage.local.get('savedSessions', function(result) {
        // Get existing sessions or initialize empty array
        const savedSessions = result.savedSessions || [];

        // Add new session to the beginning of the array
        savedSessions.unshift(sessionData);

        // Save updated sessions array
        chrome.storage.local.set({ savedSessions: savedSessions }, function() {
          // Clear input field
          sessionNameInput.value = '';

          // Update status
          updateSaveStatus();

          // Reload sessions list
          loadAndDisplaySessions();

          console.log('Session saved successfully');
        });
      });
    }
  }

  // Function to load and display saved sessions
  function loadAndDisplaySessions() {
    // Clear the list
    sessionsListDiv.innerHTML = '';

    // Get saved sessions from storage
    chrome.storage.local.get('savedSessions', function(result) {
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
        listItem.style.margin = '8px 0';
        listItem.style.padding = '5px';
        listItem.style.borderBottom = '1px solid #ddd';

        // Session name and info
        const sessionInfo = document.createElement('div');
        sessionInfo.textContent = `${session.name} (${session.tabs.length} tabs)`;

        sessionInfo.style.cursor = 'pointer';
        sessionInfo.style.color = '#0060df';

        // Add click event to open in new window
        sessionInfo.addEventListener('click', function() {
          openSessionInNewWindow(session);
        });

        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.style.marginLeft = '10px';
        deleteButton.style.padding = '2px 8px';
        deleteButton.style.backgroundColor = '#d70022';  // Red color
        deleteButton.onmouseover = () => deleteButton.style.backgroundColor = '#a4000f';
        deleteButton.onmouseout = () => deleteButton.style.backgroundColor = '#d70022';
        deleteButton.addEventListener('click', function() {
          deleteSession(index);
        });

        // Add elements to list item
        listItem.appendChild(sessionInfo);
        listItem.appendChild(deleteButton);
        sessionList.appendChild(listItem);
      });

      // Add list to the sessions div
      sessionsListDiv.appendChild(sessionList);
    });
  }

  // Function to open a session in a new window
  function openSessionInNewWindow(session) {
    if (!session.tabs || session.tabs.length === 0) {
      // Use non-blocking notification instead of alert
      const errorNotice = document.createElement('div');
      errorNotice.textContent = 'This session has no tabs to open';
      errorNotice.style.color = 'red';
      errorNotice.style.padding = '5px';
      sessionsListDiv.parentNode.insertBefore(errorNotice, sessionsListDiv);
      setTimeout(() => errorNotice.remove(), 3000);
      return;
    }

    // Filter out about: URLs as they may cause issues
    const allUrls = session.tabs.map(tab => tab.url).filter(url => !url.startsWith('about:'));

    // In Chrome, we need to create window first, then add tabs
    chrome.windows.create({}, function(newWindow) {
      console.log('Created new window with ID:', newWindow.id);

      // Add the first URL directly when creating the window
      if (allUrls.length > 0) {
        chrome.tabs.update(newWindow.tabs[0].id, { url: allUrls[0] });
      }

      // Add all remaining URLs as new tabs
      if (allUrls.length > 1) {
        for (let i = 1; i < allUrls.length; i++) {
          chrome.tabs.create({
            windowId: newWindow.id,
            url: allUrls[i]
          });
        }
      }
    });
  }

  // Variable to store the timeout ID for auto-removing undo message
  let undoTimeoutId = null;

  // Function to delete a session
  function deleteSession(index) {
    chrome.storage.local.get('savedSessions', function(result) {
      let savedSessions = result.savedSessions || [];
      const deletedSession = savedSessions[index]; // Store deleted session

      // Remove the session from the list
      savedSessions.splice(index, 1);

      chrome.storage.local.set({ savedSessions: savedSessions }, function() {
        loadAndDisplaySessions();
        showUndoButton(deletedSession, index); // Show Undo option
      });
    });
  }

  // Function to show an inline Undo button
  function showUndoButton(deletedSession, index) {
    const undoContainer = document.getElementById('undoContainer');

    // Clear previous undo messages
    undoContainer.innerHTML = '';

    // If there was a previous timeout, clear it
    if (undoTimeoutId) {
      clearTimeout(undoTimeoutId);
    }

    // Create undo message
    const undoMessage = document.createElement('div');
    undoMessage.textContent = `Session "${deletedSession.name}" deleted. `;
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

    // Restore session when Undo is clicked
    undoButton.addEventListener('click', function () {
      chrome.storage.local.get('savedSessions', function(result) {
        let savedSessions = result.savedSessions || [];
        savedSessions.splice(index, 0, deletedSession); // Reinsert at original position

        chrome.storage.local.set({ savedSessions: savedSessions }, function() {
          loadAndDisplaySessions(); // Refresh UI
          undoMessage.remove(); // Remove undo UI
        });
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
