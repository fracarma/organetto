// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execPromise = promisify(exec);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "organetto" is now active!');

	// Store reference to the webview panel
	let currentPanel: vscode.WebviewPanel | undefined = undefined;

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
		// If panel already exists, just reveal it
		if (currentPanel) {
			currentPanel.reveal(vscode.ViewColumn.One);
			return;
		}

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

		// Store the panel reference
		currentPanel = panel;

		// Reset when the panel is closed
		panel.onDidDispose(
			() => {
				currentPanel = undefined;
			},
			null,
			context.subscriptions
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
					case 'getAuthUrl':
						try {
							const authAlias = message.alias;
							vscode.window.showInformationMessage(`Retrieving Auth URL for org: ${authAlias}...`);
							const { stdout } = await execPromise(`sf org display --target-org ${authAlias} --verbose --json`);
							
							// Parse the JSON output
							const result = JSON.parse(stdout);
							const authUrl = result?.result?.sfdxAuthUrl;
							
							if (authUrl) {
								// Copy to clipboard automatically
								await vscode.env.clipboard.writeText(authUrl);
								
								// Show the auth URL in an input box so user can see and copy it
								await vscode.window.showInputBox({
									prompt: `Auth URL for ${authAlias} (already copied to clipboard)`,
									value: authUrl,
									ignoreFocusOut: true,
									title: 'SFDX Auth URL'
								});
								
								vscode.window.showInformationMessage(`Auth URL copied to clipboard!`);
							} else {
								vscode.window.showErrorMessage(`Could not find Auth URL in the response for org ${authAlias}`);
							}
						} catch (error) {
							vscode.window.showErrorMessage(`Failed to get Auth URL: ${error}`);
						}
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	function getWebviewContent(orgs: any[], lastOpenedTimes: Record<string, string>, isRefreshing: boolean, error?: string): string {
		// Read template and CSS files
		// Try different locations depending on build mode (src for dev, out for tsc, dist for esbuild)
		let templatePath: string;
		let stylesPath: string;
		
		// Try out/ first (tsc build), then dist/ (esbuild), then src/ (dev)
		const possiblePaths = ['out', 'dist', 'src'];
		for (const dir of possiblePaths) {
			const testPath = path.join(context.extensionPath, dir, 'webview', 'template.html');
			if (fs.existsSync(testPath)) {
				templatePath = testPath;
				stylesPath = path.join(context.extensionPath, dir, 'webview', 'styles.css');
				break;
			}
		}
		
		if (!templatePath! || !stylesPath!) {
			throw new Error('Could not find webview template files');
		}
		
		const template = fs.readFileSync(templatePath, 'utf8');
		const styles = fs.readFileSync(stylesPath, 'utf8');
		
		// Generate dynamic content
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
							Last Opened <span class="sort-indicator" id="sort-lastused"></span>
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
									<button class="action-button auth-url-button" onclick="getAuthUrl('${org.alias || org.username}')">🔑 Auth URL</button>
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

		// Replace placeholders in template
		return template
			.replace('{{STYLES}}', styles)
			.replace('{{CONTENT}}', orgsHtml);
	}

	context.subscriptions.push(disposable);
	context.subscriptions.push(openNewTabDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
