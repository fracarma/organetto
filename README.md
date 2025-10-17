# 🪗 ORGanetto

A Visual Studio Code extension for managing your Salesforce orgs with style and efficiency.

## Features

### 🎯 Quick Org Management
- **View all your Salesforce orgs** in a clean, sortable table
- **Open orgs** directly in your browser with one click
- **Logout from orgs** with confirmation (removes them from your authenticated list)
- **Track usage** - automatically records when you last opened each org

### 🔍 Smart Filtering & Search
- **Text search** - Start typing anywhere to instantly search orgs by alias/username
- **Connection filter** - Toggle to show/hide disconnected orgs
- **Live filtering** - Results update as you type

### 📊 Sortable Columns
Click any column header to sort by:
- **Alias** - Alphabetically by org name
- **Status** - By connection status
- **Last Used** - Most recently opened orgs first (default)

### 💾 Performance Optimized
- **Smart caching** - Org list is cached for instant loading
- **Manual refresh** - Click the refresh button to update from Salesforce CLI
- **Fast logout** - Removes orgs from the list without full refresh

### ℹ️ Detailed Org Info
Click on any org alias to view a popover with:
- Username
- Org ID
- Instance URL (clickable)
- Org Type (Dev Hub, Sandbox, or Production)

## Requirements

- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) installed and configured
- At least one authenticated Salesforce org

## Usage

1. Open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
2. Run **"ORGanetto: Show my Salesforce Orgs"**
3. Your orgs will appear in a new tab

### Keyboard Shortcuts
- **Start typing** - Automatically focuses the search box
- **Click column headers** - Sort by that column
- **Click aliases** - View detailed org information

### Actions
- **🚀 Open** - Opens the org in your default browser
- **🚪 Logout** - Logs out from the org (with confirmation)
- **🔄 Refresh** - Refreshes the org list from Salesforce CLI

## Tips

- The org list is sorted by "Last Used" by default, so your frequently used orgs appear at the top
- Use the search box to quickly find orgs in large lists
- Hide disconnected orgs to declutter your view
- The extension remembers when you last opened each org through ORGanetto

## Extension Settings

This extension doesn't require any configuration. Just install and use!

## Known Issues

None yet! Please [report any issues](https://github.com/yourusername/organetto/issues) you encounter.

## Release Notes

### 0.0.1

Initial release of ORGanetto:
- View all authenticated Salesforce orgs
- Open orgs in browser
- Logout from orgs
- Search and filter orgs
- Sortable table columns
- Track last opened date
- Smart caching for performance

---

## About

ORGanetto (named after the small accordion instrument) helps you orchestrate your Salesforce orgs efficiently.

**Enjoy!** 🪗
