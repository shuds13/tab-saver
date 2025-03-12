// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get references to DOM elements
  const sessionNameInput = document.getElementById('sessionName');
  const saveButton = document.getElementById('saveBtn');
  const sessionsListDiv = document.getElementById('sessionsList');

  // Initialize by loading saved sessions
  loadAndDisplaySessions();

  // Add event listener to the save button and hitting Enter
  saveButton.addEventListener('click', saveCurrentSession);

  sessionNameInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter') {
          event.preventDefault(); // Prevent form submission (if any)
          saveCurrentSession();
      }
});


  // Function to save current window's tabs
  function saveCurrentSession() {
    const sessionName = sessionNameInput.value.trim();

    if (!sessionName) {
      alert('Please enter a name for this session');
      return;
    }

    // Get current window with its tabs
    browser.windows.getCurrent({ populate: true })
      .then(function(currentWindow) {
        // Extract needed tab information
        const tabsData = currentWindow.tabs.map(tab => ({
          url: tab.url,
          title: tab.title
        }));

        // Create session object
        const sessionData = {
          name: sessionName,
          date: new Date().toISOString(),
          tabs: tabsData
        };

        // Get existing saved sessions
        browser.storage.local.get('savedSessions')
          .then(function(result) {
            // Get existing sessions or initialize empty array
            const savedSessions = result.savedSessions || [];

            // Add new session
            savedSessions.push(sessionData);

            // Save updated sessions array
            return browser.storage.local.set({ savedSessions: savedSessions });
          })
          .then(function() {
            // Clear input field
            sessionNameInput.value = '';

            // Reload sessions list
            loadAndDisplaySessions();

            console.log('Session saved successfully');
          })
          .catch(function(error) {
            console.error('Error saving session:', error);
            alert('Error saving session: ' + error.message);
          });
      })
      .catch(function(error) {
        console.error('Error getting current window:', error);
        alert('Error getting current window: ' + error.message);
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
      })
      .catch(function(error) {
        console.error('Error loading sessions:', error);
        sessionsListDiv.textContent = 'Error loading sessions';
      });
  }

  // Function to open a session in a new window
    function openSessionInNewWindow(session) {
        if (!session.tabs || session.tabs.length === 0) {
            alert('This session has no tabs to open');
            return;
        }

        // Create a new window with ALL saved tabs at once
        // const allUrls = session.tabs.map(tab => tab.url);
        const allUrls = session.tabs.map(tab => tab.url).filter(url => !url.startsWith('about:'));

        browser.windows.create({ url: allUrls })
            .then(function(newWindow) {
                console.log('Created new window with ID:', newWindow.id);
            })
            .catch(function(error) {
                console.error('Error opening session:', error);
                alert('Error opening session: ' + error.message);
            });
    }


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
                  showUndoButton(deletedSession, index); // Show Undo option
              });
          })
          .catch(error => {
              console.error('Error deleting session:', error);
              alert('Error deleting session: ' + error.message);
          });
  }

  // Function to show an inline Undo button
  function showUndoButton(deletedSession, index) {
      const sessionsListDiv = document.getElementById('sessionsList');

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
          browser.storage.local.get('savedSessions')
              .then(result => {
                  let savedSessions = result.savedSessions || [];
                  savedSessions.splice(index, 0, deletedSession); // Reinsert at original position
                  return browser.storage.local.set({ savedSessions });
              })
              .then(() => {
                  loadAndDisplaySessions(); // Refresh UI
                  undoMessage.remove(); // Remove undo UI
              })
              .catch(error => {
                  console.error('Error restoring session:', error);
              });
      });

      // Add Undo button to the UI
      undoMessage.appendChild(undoButton);
      sessionsListDiv.appendChild(undoMessage);

      // Auto-remove the Undo option after 5 seconds
      setTimeout(() => {
          if (undoMessage.parentNode) {
              undoMessage.remove();
          }
      }, 5000);
  }

});
