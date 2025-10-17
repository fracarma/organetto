// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execPromise = promisify(exec);

// Centralized logger with [ORGanetto] prefix
const logger = {
	log: (...args: any[]) => console.log('[ORGanetto]', ...args),
	warn: (...args: any[]) => console.warn('[ORGanetto]', ...args),
	error: (...args: any[]) => console.error('[ORGanetto]', ...args)
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	logger.log('Congratulations, your extension "organetto" is now active!');

	// Check SF CLI version before doing anything
	checkSfCliVersion();

	// Store reference to the webview panel
	let currentPanel: vscode.WebviewPanel | undefined = undefined;

	async function fetchAndCacheOrgs(forceRefresh: boolean = false): Promise<any[]> {
		// Check if we have cached data and don't need to force refresh
		if (!forceRefresh) {
			const cachedOrgs = context.globalState.get<any[]>('salesforceOrgs');
			if (cachedOrgs) {
				logger.log('Using cached org data');
				return cachedOrgs;
			}
		}

		logger.log('Fetching fresh org data from SF CLI...');
		
		try {
			// Execute sf org list command with --all to include scratch orgs
			const { stdout, stderr } = await execPromise('sf org list --all --json');
			
			if (stderr) {
				logger.error('Error executing sf org list:', stderr);
			}

			// Parse the JSON output
			const result = JSON.parse(stdout);
			logger.log('Raw result from sf org list:', JSON.stringify(result, null, 2));
			
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

			logger.log('Parsed orgs:', orgs);

			// Cache the results
			await context.globalState.update('salesforceOrgs', orgs);
			logger.log('Org data cached successfully');

			return orgs;
		} catch (error) {
			logger.error('Error fetching orgs:', error);
			throw error;
		}
	}

	const openNewTabDisposable = vscode.commands.registerCommand('organetto.openNewTab', async () => {
		logger.log('openNewTab command triggered');
		
		// If panel already exists, just reveal it
		if (currentPanel) {
			logger.log('Panel already exists, revealing it');
			currentPanel.reveal(vscode.ViewColumn.One);
			return;
		}

		logger.log('Creating new webview panel');
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
				logger.log('Panel disposed');
				currentPanel = undefined;
			},
			null,
			context.subscriptions
		);

		// Show loading state initially
		logger.log('Loading initial webview state');
		const lastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
		panel.webview.html = getWebviewContent([], lastOpenedTimes, false);

		try {
			logger.log('Fetching Salesforce orgs');
			// Fetch orgs (from cache or fresh)
			const orgs = await fetchAndCacheOrgs(false);
			logger.log(`Successfully fetched ${orgs.length} orgs`);

			// Update the webview with org data
			panel.webview.html = getWebviewContent(orgs, lastOpenedTimes, false);
		} catch (error) {
			logger.error('Error fetching Salesforce orgs:', error);
			vscode.window.showErrorMessage(`Failed to fetch Salesforce orgs: ${error}`);
			panel.webview.html = getWebviewContent([], lastOpenedTimes, false, `Error: ${error}`);
		}

		// Handle messages from the webview (e.g., refresh button, open org)
		panel.webview.onDidReceiveMessage(
			async message => {
				logger.log(`Received message from webview: ${message.command}`);
				
				switch (message.command) {
					case 'refresh':
						logger.log('Refreshing org list');
						try {
							const refreshLastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							panel.webview.html = getWebviewContent([], refreshLastOpenedTimes, true);
							const orgs = await fetchAndCacheOrgs(true);
							panel.webview.html = getWebviewContent(orgs, refreshLastOpenedTimes, false);
							vscode.window.showInformationMessage('Org list refreshed!');
							logger.log('Org list refresh completed successfully');
						} catch (error) {
							logger.error('Error refreshing org list:', error);
							vscode.window.showErrorMessage(`Failed to refresh orgs: ${error}`);
							const errorLastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							panel.webview.html = getWebviewContent([], errorLastOpenedTimes, false, `Error: ${error}`);
						}
						break;
					case 'openOrg':
						try {
							const alias = message.alias;
							logger.log(`Opening org: ${alias}`);
							vscode.window.showInformationMessage(`Opening org: ${alias}...`);
							await execPromise(`sf org open -o ${alias}`);
							
							// Track the last opened time
							const lastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							lastOpenedTimes[alias] = new Date().toISOString();
							await context.globalState.update('orgLastOpenedTimes', lastOpenedTimes);
							
							vscode.window.showInformationMessage(`Org ${alias} opened successfully!`);
							logger.log(`Org ${alias} opened successfully`);
							
							// Refresh the view to show updated last opened time
							const orgs = await fetchAndCacheOrgs(false);
							panel.webview.html = getWebviewContent(orgs, lastOpenedTimes, false);
						} catch (error) {
							logger.error(`Error opening org ${message.alias}:`, error);
							vscode.window.showErrorMessage(`Failed to open org: ${error}`);
						}
						break;
					case 'logoutOrg':
						const logoutAlias = message.alias;
						logger.log(`Logout requested for org: ${logoutAlias}`);
						const confirmation = await vscode.window.showWarningMessage(
							`Are you sure you want to log out of the org "${logoutAlias}"?`,
							{ modal: true },
							'Logout'
						);
						
						if (confirmation === 'Logout') {
							logger.log(`Logout confirmed for org: ${logoutAlias}`);
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
								logger.log(`Successfully logged out of org: ${logoutAlias}`);
								
								// Tell webview to remove the row
								panel.webview.postMessage({ command: 'removeOrg', alias: logoutAlias });
							} catch (error) {
								logger.error(`Error logging out of org ${logoutAlias}:`, error);
								vscode.window.showErrorMessage(`Failed to logout of org: ${error}`);
							}
						} else {
							logger.log(`Logout cancelled for org: ${logoutAlias}`);
						}
						break;
					case 'getAuthUrl':
						try {
							const authAlias = message.alias;
							logger.log(`Retrieving Auth URL for org: ${authAlias}`);
							vscode.window.showInformationMessage(`Retrieving Auth URL for org: ${authAlias}...`);
							const { stdout } = await execPromise(`sf org display --target-org ${authAlias} --verbose --json`);
							
							// Parse the JSON output
							const result = JSON.parse(stdout);
							const authUrl = result?.result?.sfdxAuthUrl;
							
							if (authUrl) {
								logger.log(`Successfully retrieved Auth URL for org: ${authAlias}`);
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
								logger.warn(`Auth URL not found in response for org: ${authAlias}`);
								vscode.window.showErrorMessage(`Could not find Auth URL in the response for org ${authAlias}`);
							}
						} catch (error) {
							logger.error(`Error retrieving Auth URL for org ${message.alias}:`, error);
							vscode.window.showErrorMessage(`Failed to get Auth URL: ${error}`);
						}
						break;
					case 'setDefaultOrg':
						try {
							const defaultAlias = message.alias;
							logger.log(`Setting default org to: ${defaultAlias}`);
							vscode.window.showInformationMessage(`Setting default org to: ${defaultAlias}...`);
							await execPromise(`sf config set target-org ${defaultAlias}`);
							vscode.window.showInformationMessage(`Default org set to ${defaultAlias} successfully!`);
							logger.log(`Successfully set default org to: ${defaultAlias}`);
						} catch (error) {
							logger.error(`Error setting default org to ${message.alias}:`, error);
							vscode.window.showErrorMessage(`Failed to set default org: ${error}`);
						}
						break;
					case 'reauthenticate':
						try {
							const reauthAlias = message.alias;
							logger.log(`Reauthenticating org: ${reauthAlias}`);
							
							// Get the org details from cached data
							const cachedOrgs = context.globalState.get<any[]>('salesforceOrgs') || [];
							const org = cachedOrgs.find(o => 
								(o?.alias === reauthAlias) || 
								(o?.username === reauthAlias)
							);
							
							if (!org) {
								logger.warn(`Org not found in cache: ${reauthAlias}`);
								vscode.window.showErrorMessage(`Could not find org ${reauthAlias} in cached data`);
								break;
							}
							
							const instanceUrl = org.instanceUrl;
							if (!instanceUrl) {
								logger.warn(`Instance URL not found for org: ${reauthAlias}`);
								vscode.window.showErrorMessage(`Could not find instance URL for org ${reauthAlias}`);
								break;
							}
							
							logger.log(`Instance URL for ${reauthAlias}: ${instanceUrl}`);
							vscode.window.showInformationMessage(`Reauthenticating org: ${reauthAlias}...`);
							
							// Execute the reauthentication command
							await execPromise(`sf org login web --alias ${reauthAlias} --instance-url ${instanceUrl}`);
							
							vscode.window.showInformationMessage(`Org ${reauthAlias} reauthenticated successfully!`);
							logger.log(`Successfully reauthenticated org: ${reauthAlias}`);
							
							// Refresh the org list to show updated status
							const orgs = await fetchAndCacheOrgs(true);
							const reauthLastOpenedTimes = context.globalState.get<Record<string, string>>('orgLastOpenedTimes') || {};
							panel.webview.html = getWebviewContent(orgs, reauthLastOpenedTimes, false);
						} catch (error) {
							logger.error(`Error reauthenticating org ${message.alias}:`, error);
							vscode.window.showErrorMessage(`Failed to reauthenticate org: ${error}`);
						}
						break;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	// Helper function to check SF CLI version
	async function checkSfCliVersion(): Promise<boolean> {
		try {
			const { stdout } = await execPromise('sf --version');
			logger.log('SF CLI version output:', stdout);
			
			// Parse version from output (format: "@salesforce/cli/2.105.0 darwin-arm64 node-v20.11.0")
			const versionMatch = stdout.match(/@salesforce\/cli\/(\d+)\.(\d+)\.(\d+)/);
			
			if (!versionMatch) {
				logger.error('Could not parse SF CLI version from output');
				return false;
			}
			
			const major = parseInt(versionMatch[1], 10);
			const minor = parseInt(versionMatch[2], 10);
			const patch = parseInt(versionMatch[3], 10);
			
			logger.log(`Detected SF CLI version: ${major}.${minor}.${patch}`);
			
			// Check if version is >= 2.105.0
			if (major > 2) {
				return true;
			}
			if (major === 2 && minor > 105) {
				return true;
			}
			if (major === 2 && minor === 105 && patch >= 0) {
				return true;
			}
			
			logger.warn('SF CLI version check failed');
			vscode.window.showWarningMessage(
				`ORGanetto requires Salesforce CLI version 2.105.0 or higher, you are using version ${major}.${minor}.${patch}. Please update SF CLI by following the instructions here: https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_update_cli.html`
			);
			return false;
		} catch (error) {
			logger.error('Error checking SF CLI version:', error);
			return false;
		}
	}

	function getWebviewContent(orgs: any[], lastOpenedTimes: Record<string, string>, isRefreshing: boolean, error?: string): string {
		logger.log(`getWebviewContent called with ${orgs.length} orgs, isRefreshing: ${isRefreshing}, error: ${error || 'none'}`);
		
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
				logger.log(`Found webview files in ${dir}/ directory`);
				break;
			}
		}
		
		if (!templatePath! || !stylesPath!) {
			logger.error('Could not find webview template files in any of the expected directories');
			throw new Error('Could not find webview template files');
		}
		
		logger.log('Reading template and styles files');
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
						<th>Type</th>
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
								<span class="org-type-icon" title="${org.isScratch ? 'Scratch Org' : org.isDevHub ? 'Dev Hub' : org.isSandbox ? 'Sandbox' : 'Production'}">
									${org.isScratch ? '⚡' : org.isDevHub ? '🔧' : org.isSandbox ? '🧪' : '🏢'}
								</span>
							</td>
							<td>
								<strong class="org-alias" data-org-index="${index}">
									${org.alias || org.username || '-'} <span style="opacity: 0.6; font-size: 0.9em;">ℹ️</span>
								</strong>
							</td>
							<td><span class="badge ${org.connectedStatus || ''}">${org.connectedStatus || '-'}</span></td>
							<td>${lastUsedText}</td>
							<td>
								<div class="action-buttons">
									<button class="action-button" onclick="openOrg('${org.alias || org.username}')">🚀 Open</button>
									<div class="dropdown">
										<button class="action-button dropdown-toggle" onclick="toggleDropdown(event, ${index})">⋯</button>
										<div class="dropdown-menu" id="dropdown-${index}">
											<button class="dropdown-item" onclick="setDefaultOrg('${org.alias || org.username}')">⭐ Set as Default</button>
											<button class="dropdown-item" onclick="getAuthUrl('${org.alias || org.username}')">🔑 Get Auth URL</button>
											<button class="dropdown-item" onclick="reauthenticateOrg('${org.alias || org.username}')">🔐 Reauthenticate</button>
											<button class="dropdown-item logout-item" onclick="logoutOrg('${org.alias || org.username}')">🚪 Logout</button>
										</div>
									</div>
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
					
					// Determine org type
					let orgType = '🏢 Production';
					if (org.isScratch) {
						orgType = '⚡ Scratch Org';
					} else if (org.isDevHub) {
						orgType = '🔧 Dev Hub';
					} else if (org.isSandbox) {
						orgType = '🧪 Sandbox';
					}
					document.getElementById('popover-type').textContent = orgType;
					
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

		// Log warnings for edge cases
		if (orgs.length === 0 && !error && !isRefreshing) {
			logger.warn('No orgs found in the system');
		}

		logger.log('Generating final HTML by replacing template placeholders');
		// Replace placeholders in template
		const finalHtml = template
			.replace('{{STYLES}}', styles)
			.replace('{{CONTENT}}', orgsHtml);
		
		logger.log(`Successfully generated webview content (${finalHtml.length} characters)`);
		return finalHtml;
	}

	context.subscriptions.push(openNewTabDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
