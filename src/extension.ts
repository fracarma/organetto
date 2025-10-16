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
		panel.webview.html = getWebviewContent([]);

		try {
			// Execute sf org list command
			const { stdout, stderr } = await execPromise('sf org list --json');
			
			if (stderr) {
				console.error('Error executing sf org list:', stderr);
			}

			// Parse the JSON output
			const result = JSON.parse(stdout);
			const orgs = result.result || [];

			// Update the webview with org data
			panel.webview.html = getWebviewContent(orgs);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to fetch Salesforce orgs: ${error}`);
			panel.webview.html = getWebviewContent([], `Error: ${error}`);
		}
	});

	function getWebviewContent(orgs: any[], error?: string) {
		const orgsHtml = orgs.length === 0 && !error
			? '<p style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">Loading orgs...</p>'
			: error
			? `<div style="padding: 20px; color: var(--vscode-errorForeground); background-color: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 4px;">${error}</div>`
			: `
			<table>
				<thead>
					<tr>
						<th>Alias</th>
						<th>Username</th>
						<th>Org ID</th>
						<th>Instance URL</th>
						<th>Status</th>
						<th>Type</th>
					</tr>
				</thead>
				<tbody>
					${orgs.map(org => `
						<tr>
							<td><strong>${org.alias || '-'}</strong></td>
							<td>${org.username || '-'}</td>
							<td><code>${org.orgId || '-'}</code></td>
							<td><a href="${org.instanceUrl || '#'}">${org.instanceUrl || '-'}</a></td>
							<td><span class="badge ${org.connectedStatus || ''}">${org.connectedStatus || '-'}</span></td>
							<td>${org.isDevHub ? '🔧 Dev Hub' : org.isSandbox ? '🧪 Sandbox' : '🏢 Production'}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
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
        .info-bar {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <h1>🌩️ Salesforce Orgs</h1>
    <div class="info-bar">
        <strong>Total Orgs:</strong> ${orgs.length}
    </div>
    ${orgsHtml}
</body>
</html>`;
	}

	context.subscriptions.push(disposable);
	context.subscriptions.push(openNewTabDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
