// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get references to DOM elements
  const sessionNameInput = document.getElementById('sessionName');
  const saveButton = document.getElementById('saveBtn');
  const sessionsListDiv = document.getElementById('sessionsList');

  // Initialize by loading saved sessions
  loadAndDisplaySessions();

  // Add event listener to the save button
  saveButton.addEventListener('click', function() {
    saveCurrentSession();
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
        const allUrls = session.tabs.map(tab => tab.url);

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
    if (confirm('Are you sure you want to delete this session?')) {
      browser.storage.local.get('savedSessions')
        .then(function(result) {
          const savedSessions = result.savedSessions || [];

          // Remove the session at the specified index
          savedSessions.splice(index, 1);

          // Save updated sessions
          return browser.storage.local.set({ savedSessions: savedSessions });
        })
        .then(function() {
          // Reload sessions list
          loadAndDisplaySessions();
        })
        .catch(function(error) {
          console.error('Error deleting session:', error);
          alert('Error deleting session: ' + error.message);
        });
    }
  }
});
