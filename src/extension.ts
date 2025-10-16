// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "organetto" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('organetto.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		console.log('log level from ORGanetto!');
		console.warn('warn level from ORGanetto!');
		console.error('error level from ORGanetto!');
		vscode.window.showInformationMessage('Hello World from ORGanetto!');
	});

	async function fetchAndCacheOrgs(forceRefresh: boolean = false): Promise<any[]> {
		// Check if we have cached data and don't need to force refresh
		if (!forceRefresh) {
			const cachedOrgs = context.globalState.get<any[]>('salesforceOrgs');
			if (cachedOrgs) {
				console.log('Using cached org data');
				return cachedOrgs;
			}
		}

		console.log('Fetching fresh org data from SF CLI...');
		
		try {
			// Execute sf org list command
			const { stdout, stderr } = await execPromise('sf org list --json');
			
			if (stderr) {
				console.error('Error executing sf org list:', stderr);
			}

			// Parse the JSON output
			const result = JSON.parse(stdout);
			console.log('Raw result from sf org list:', JSON.stringify(result, null, 2));
			
			// Handle different possible structures
			let orgs: any[] = [];
			if (result.result) {
				// Check if result.result is an object with nonScratchOrgs or scratchOrgs
				if (result.result.nonScratchOrgs) {
					orgs = [...result.result.nonScratchOrgs];
				}
				if (result.result.scratchOrgs) {
					orgs = [...orgs, ...result.result.scratchOrgs];
				}
				// If result.result is already an array
				if (Array.isArray(result.result)) {
					orgs = result.result;
				}
			}

			console.log('Parsed orgs:', orgs);

			// Cache the results
			await context.globalState.update('salesforceOrgs', orgs);
			console.log('Org data cached successfully');

			return orgs;
		} catch (error) {
			console.error('Error fetching orgs:', error);
			throw error;
		}
	}

	const openNewTabDisposable = vscode.commands.registerCommand('organetto.openNewTab', async () => {
		// Create a webview panel to display HTML content
		const panel = vscode.window.createWebviewPanel(
			'organettoView', // Identifies the type of the webview
			'ORGanetto - Salesforce Orgs', // Title of the panel displayed to the user
			vscode.ViewColumn.One, // Editor column to show the new webview panel in
			{
				enableScripts: true, // Enable JavaScript in the webview
				retainContextWhenHidden: true // Keep the webview content when hidden
			}
		);

		// Show loading state initially
		const lastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
		panel.webview.html = getWebviewContent([], lastOpenedTimes, false);

		try {
			// Fetch orgs (from cache or fresh)
			const orgs = await fetchAndCacheOrgs(false);

			// Update the webview with org data
			panel.webview.html = getWebviewContent(orgs, lastOpenedTimes, false);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch Salesforce orgs: ${error}`);
			panel.webview.html = getWebviewContent([], lastOpenedTimes, false, `Error: ${error}`);
		}

		// Handle messages from the webview (e.g., refresh button, open org)
		panel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'refresh':
						try {
							const refreshLastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							panel.webview.html = getWebviewContent([], refreshLastOpenedTimes, true);
							const orgs = await fetchAndCacheOrgs(true);
							panel.webview.html = getWebviewContent(orgs, refreshLastOpenedTimes, false);
							vscode.window.showInformationMessage('Org list refreshed!');
						} catch (error) {
							vscode.window.showErrorMessage(`Failed to refresh orgs: ${error}`);
							const errorLastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							panel.webview.html = getWebviewContent([], errorLastOpenedTimes, false, `Error: ${error}`);
						}
						break;
					case 'openOrg':
						try {
							const alias = message.alias;
							vscode.window.showInformationMessage(`Opening org: ${alias}...`);
							await execPromise(`sf org open -o ${alias}`);
							
							// Track the last opened time
							const lastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							lastOpenedTimes[alias] = new Date().toISOString();
							await context.globalState.update('orgLastOpenedTimes', lastOpenedTimes);
							
							vscode.window.showInformationMessage(`Org ${alias} opened successfully!`);
							
							// Refresh the view to show updated last opened time
							const orgs = await fetchAndCacheOrgs(false);
							panel.webview.html = getWebviewContent(orgs, lastOpenedTimes, false);
						} catch (error) {
							vscode.window.showErrorMessage(`Failed to open org: ${error}`);
						}
						break;
					case 'logoutOrg':
						const logoutAlias = message.alias;
						const confirmation = await vscode.window.showWarningMessage(
							`Are you sure you want to log out of the org "${logoutAlias}"?`,
							{ modal: true },
							'Logout',
							'Cancel'
						);
						
						if (confirmation === 'Logout') {
							try {
								vscode.window.showInformationMessage(`Logging out of org: ${logoutAlias}...`);
								await execPromise(`sf org logout --target-org ${logoutAlias} --no-prompt`);
								
								// Remove from last opened times
								const logoutLastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
								delete logoutLastOpenedTimes[logoutAlias];
								await context.globalState.update('orgLastOpenedTimes', logoutLastOpenedTimes);
								
								// Remove from cached org list
								const cachedOrgs = context.globalState.get<any[]>('salesforceOrgs') || [];
								const updatedOrgs = cachedOrgs.filter(org => 
									(org.alias || org.username) !== logoutAlias
								);
								await context.globalState.update('salesforceOrgs', updatedOrgs);
								
								vscode.window.showInformationMessage(`Logged out of org ${logoutAlias} successfully!`);
								
								// Tell webview to remove the row
								panel.webview.postMessage({ command: 'removeOrg', alias: logoutAlias });
							} catch (error) {
								vscode.window.showErrorMessage(`Failed to logout of org: ${error}`);
							}
						}
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	function getWebviewContent(orgs: any[], lastOpenedTimes: Record<string, string>, isRefreshing: boolean, error?: string) {
		const orgsHtml = orgs.length === 0 && !error
			? '<p style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">' + (isRefreshing ? 'Refreshing orgs...' : 'Loading orgs...') + '</p>'
			: error
			? `<div style="padding: 20px; color: var(--vscode-errorForeground); background-color: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 4px;">${error}</div>`
			: `
			<div class="filter-bar">
				<div class="filter-controls">
					<div class="search-box">
						<input type="text" id="searchInput" placeholder="Search orgs..." oninput="applyFilter()">
					</div>
					<label class="filter-checkbox">
						<input type="checkbox" id="hideDisconnected" checked onchange="applyFilter()">
						<span>Hide disconnected orgs</span>
					</label>
				</div>
			</div>
			<table>
				<thead>
					<tr>
						<th class="sortable" onclick="sortTable('alias')">
							Alias <span class="sort-indicator" id="sort-alias"></span>
						</th>
						<th class="sortable" onclick="sortTable('status')">
							Status <span class="sort-indicator" id="sort-status"></span>
						</th>
						<th class="sortable" onclick="sortTable('lastused')">
							Last Used <span class="sort-indicator" id="sort-lastused"></span>
						</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody id="orgs-table-body">
					${orgs.map((org, index) => {
						// Format last opened date from tracked data
						const orgKey = org.alias || org.username;
						let lastUsedText = 'Never';
						if (lastOpenedTimes[orgKey]) {
							const lastUsedDate = new Date(lastOpenedTimes[orgKey]);
							const now = new Date();
							const diffMs = now.getTime() - lastUsedDate.getTime();
							const diffMins = Math.floor(diffMs / 60000);
							const diffHours = Math.floor(diffMs / 3600000);
							const diffDays = Math.floor(diffMs / 86400000);
							
							if (diffMins < 1) {
								lastUsedText = 'Just now';
							} else if (diffMins < 60) {
								lastUsedText = diffMins + ' min ago';
							} else if (diffHours < 24) {
								lastUsedText = diffHours + ' hr ago';
							} else if (diffDays < 7) {
								lastUsedText = diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' ago';
							} else {
								lastUsedText = lastUsedDate.toLocaleDateString();
							}
						}
						
						return `
						<tr class="org-row" 
							data-connected="${org.connectedStatus === 'Connected'}"
							data-alias="${(org.alias || org.username || '').toLowerCase()}"
							data-status="${org.connectedStatus || ''}"
							data-lastused="${lastOpenedTimes[orgKey] || ''}">
							<td>
								<strong class="org-alias" data-org-index="${index}">
									${org.alias || org.username || '-'}
								</strong>
							</td>
							<td><span class="badge ${org.connectedStatus || ''}">${org.connectedStatus || '-'}</span></td>
							<td>${lastUsedText}</td>
							<td>
								<div class="action-buttons">
									<button class="action-button" onclick="openOrg('${org.alias || org.username}')">🚀 Open</button>
									<button class="action-button logout-button" onclick="logoutOrg('${org.alias || org.username}')">🚪 Logout</button>
								</div>
							</td>
						</tr>
						`;
					}).join('')}
				</tbody>
			</table>
			<div id="popover" class="popover" style="display: none;">
				<div class="popover-content">
					<div class="popover-header">
						<strong id="popover-alias"></strong>
						<button class="popover-close" onclick="closePopover()">✕</button>
					</div>
					<div class="popover-body">
						<div class="popover-item">
							<span class="popover-label">Username:</span>
							<span id="popover-username"></span>
						</div>
						<div class="popover-item">
							<span class="popover-label">Org ID:</span>
							<code id="popover-orgid"></code>
						</div>
						<div class="popover-item">
							<span class="popover-label">Instance URL:</span>
							<a id="popover-url" href="#" target="_blank"></a>
						</div>
						<div class="popover-item">
							<span class="popover-label">Type:</span>
							<span id="popover-type"></span>
						</div>
					</div>
				</div>
			</div>
			<script>
				const orgsData = ${JSON.stringify(orgs)};
				
				function closePopover() {
					document.getElementById('popover').style.display = 'none';
				}
				
				function showPopover(org, element) {
					const popover = document.getElementById('popover');
					const rect = element.getBoundingClientRect();
					
					// Set popover content
					document.getElementById('popover-alias').textContent = org.alias || org.username || '-';
					document.getElementById('popover-username').textContent = org.username || '-';
					document.getElementById('popover-orgid').textContent = org.orgId || '-';
					document.getElementById('popover-url').textContent = org.instanceUrl || '-';
					document.getElementById('popover-url').href = org.instanceUrl || '#';
					document.getElementById('popover-type').textContent = org.isDevHub ? '🔧 Dev Hub' : org.isSandbox ? '🧪 Sandbox' : '🏢 Production';
					
					// Position and show popover
					popover.style.display = 'block';
					popover.style.top = rect.bottom + 10 + 'px';
					popover.style.left = rect.left + 'px';
				}
				
				// Add click handlers to aliases
				document.querySelectorAll('.org-alias').forEach(alias => {
					alias.addEventListener('click', function(e) {
						const index = parseInt(this.getAttribute('data-org-index'));
						const org = orgsData[index];
						showPopover(org, this);
						e.stopPropagation();
					});
				});
				
				// Close popover when clicking outside
				document.addEventListener('click', function(e) {
					if (!e.target.closest('.popover') && !e.target.closest('.org-alias')) {
						closePopover();
					}
				});
			</script>
			`;

		return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ORGanetto - Salesforce Orgs</title>
    <style>
        body {
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            color: var(--vscode-foreground);
            padding: 12px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid var(--vscode-textLink-foreground);
        }
        th.sortable {
            cursor: pointer;
            user-select: none;
        }
        th.sortable:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .sort-indicator {
            color: var(--vscode-textLink-foreground);
            font-size: 0.8em;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }
        .badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 500;
        }
        .badge.Connected {
            background-color: rgba(0, 128, 0, 0.2);
            color: #4caf50;
        }
        .badge.RefreshTokenAuthError,
        .badge.Unknown {
            background-color: rgba(255, 165, 0, 0.2);
            color: #ff9800;
        }
        .org-alias {
            cursor: pointer;
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            text-decoration-style: dotted;
        }
        .org-alias:hover {
            opacity: 0.8;
        }
        .popover {
            position: fixed;
            z-index: 1000;
            background-color: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            min-width: 300px;
            max-width: 500px;
        }
        .popover-content {
            padding: 0;
        }
        .popover-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-widget-border);
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px 6px 0 0;
        }
        .popover-close {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 16px;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 3px;
        }
        .popover-close:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .popover-body {
            padding: 16px;
        }
        .popover-item {
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .popover-item:last-child {
            margin-bottom: 0;
        }
        .popover-label {
            font-weight: 600;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        .popover-item code {
            word-break: break-all;
        }
        .popover-item a {
            word-break: break-all;
        }
        .refresh-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .refresh-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .refresh-button:active {
            transform: scale(0.98);
        }
        .action-buttons {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .action-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 13px;
            border-radius: 4px;
            white-space: nowrap;
        }
        .action-button:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .action-button:active {
            transform: scale(0.98);
        }
        .logout-button {
            background-color: rgba(255, 165, 0, 0.15);
            color: var(--vscode-editorWarning-foreground);
        }
        .logout-button:hover {
            background-color: rgba(255, 165, 0, 0.25);
        }
        .filter-bar {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 16px;
        }
        .filter-controls {
            display: flex;
            align-items: center;
            gap: 16px;
            flex-wrap: wrap;
        }
        .search-box {
            flex: 1;
            min-width: 200px;
        }
        .search-box input {
            width: 100%;
            padding: 6px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 14px;
            outline: none;
        }
        .search-box input:focus {
            border-color: var(--vscode-focusBorder);
        }
        .search-box input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        .filter-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        .filter-checkbox input[type="checkbox"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
        }
        .filter-checkbox span {
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1 style="margin: 0;">🪗 ORGanetto</h1>
        <button class="refresh-button" onclick="refreshOrgs()">🔄 Refresh</button>
    </div>
    ${orgsHtml}
    <script>
        const vscode = acquireVsCodeApi();
        let currentSort = { column: null, ascending: true };
        
        function refreshOrgs() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function openOrg(alias) {
            vscode.postMessage({ command: 'openOrg', alias: alias });
        }
        
        function logoutOrg(alias) {
            vscode.postMessage({ command: 'logoutOrg', alias: alias });
        }
        
        function applyFilter() {
            const hideDisconnected = document.getElementById('hideDisconnected').checked;
            const searchText = document.getElementById('searchInput').value.toLowerCase();
            const rows = document.querySelectorAll('.org-row');
            
            rows.forEach(row => {
                const isConnected = row.getAttribute('data-connected') === 'true';
                const alias = row.getAttribute('data-alias');
                
                // Check if should hide based on connection status
                const hideByConnection = hideDisconnected && !isConnected;
                
                // Check if should hide based on search text
                const hideBySearch = searchText && !alias.includes(searchText);
                
                if (hideByConnection || hideBySearch) {
                    row.style.display = 'none';
                } else {
                    row.style.display = '';
                }
            });
        }
        
        function sortTable(column) {
            const tbody = document.getElementById('orgs-table-body');
            const rows = Array.from(tbody.getElementsByClassName('org-row'));
            
            // Toggle sort direction if clicking the same column
            if (currentSort.column === column) {
                currentSort.ascending = !currentSort.ascending;
            } else {
                currentSort.column = column;
                currentSort.ascending = true;
            }
            
            // Sort rows
            rows.sort((a, b) => {
                let aVal, bVal;
                
                switch(column) {
                    case 'alias':
                        aVal = a.getAttribute('data-alias');
                        bVal = b.getAttribute('data-alias');
                        break;
                    case 'status':
                        aVal = a.getAttribute('data-status');
                        bVal = b.getAttribute('data-status');
                        break;
                    case 'lastused':
                        aVal = a.getAttribute('data-lastused');
                        bVal = b.getAttribute('data-lastused');
                        // Sort by date, with empty values (Never) at the end
                        if (!aVal && !bVal) return 0;
                        if (!aVal) return 1;
                        if (!bVal) return -1;
                        return currentSort.ascending ? 
                            new Date(bVal) - new Date(aVal) : 
                            new Date(aVal) - new Date(bVal);
                }
                
                // String comparison for alias and status
                if (column !== 'lastused') {
                    if (aVal < bVal) return currentSort.ascending ? -1 : 1;
                    if (aVal > bVal) return currentSort.ascending ? 1 : -1;
                    return 0;
                }
                
                return 0;
            });
            
            // Reorder DOM elements
            rows.forEach(row => tbody.appendChild(row));
            
            // Update sort indicators
            document.querySelectorAll('.sort-indicator').forEach(el => el.textContent = '');
            const indicator = document.getElementById('sort-' + column);
            if (indicator) {
                indicator.textContent = currentSort.ascending ? ' ▲' : ' ▼';
            }
            
            // Reapply filter after sorting
            applyFilter();
        }
        
        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'removeOrg':
                    // Find and remove the row with matching alias
                    const rows = document.querySelectorAll('.org-row');
                    rows.forEach(row => {
                        const alias = row.getAttribute('data-alias');
                        if (alias === message.alias.toLowerCase()) {
                            row.remove();
                        }
                    });
                    break;
            }
        });
        
        // Apply filter on page load
        window.addEventListener('DOMContentLoaded', applyFilter);
    </script>
</body>
</html>`;
	}

	context.subscriptions.push(disposable);
	context.subscriptions.push(openNewTabDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
