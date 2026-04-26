#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('🚀 Installing Claude Autopilot Plugin...');

const pluginSource = path.resolve(__dirname);
const pluginName = 'autopilot';

// 1. Detect Claude Settings Path
const homeDir = os.homedir();
const claudeConfigDir = path.join(homeDir, '.claude');
const settingsPath = path.join(claudeConfigDir, 'settings.json');

if (!fs.existsSync(settingsPath)) {
    console.error('❌ Could not find Claude Code settings at:', settingsPath);
    console.log('Please run Claude Code at least once before installing.');
    process.exit(1);
}

// 2. Update settings.json to include this directory globally
try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    
    // Ensure "pluginDirectories" exists and include this plugin
    if (!settings.pluginDirectories) {
        settings.pluginDirectories = [];
    }

    if (!settings.pluginDirectories.includes(pluginSource)) {
        settings.pluginDirectories.push(pluginSource);
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log('✅ Added plugin directory to Claude settings.');
    } else {
        console.log('ℹ️  Plugin directory already registered.');
    }
} catch (err) {
    console.error('❌ Failed to update Claude settings:', err.message);
    process.exit(1);
}

// 3. Fix Environment Paths (Windows specific)
if (process.platform === 'win32') {
    try {
        const gitPath = execSync('where.exe git').toString().split('\n')[0].trim();
        if (gitPath) {
            const gitBin = path.join(path.dirname(gitPath), '..', 'bin', 'bash.exe');
            if (fs.existsSync(gitBin)) {
                // Update the scripts with the local path
                const scripts = ['bin/autopilot', 'bin/autopilot.ps1'];
                scripts.forEach(s => {
                    const filePath = path.join(pluginSource, s);
                    let content = fs.readFileSync(filePath, 'utf8');
                    content = content.replace(/CLAUDE_CODE_GIT_BASH_PATH=".*"/g, `CLAUDE_CODE_GIT_BASH_PATH="${gitBin.replace(/\\/g, '/')}"`);
                    content = content.replace(/CLAUDE_CODE_GIT_BASH_PATH = ".*"/g, `CLAUDE_CODE_GIT_BASH_PATH = "${gitBin.replace(/\\/g, '/')}"`);
                    fs.writeFileSync(filePath, content);
                });
                console.log('✅ Automatically configured Git Bash path:', gitBin);
            }
        }
    } catch (e) {
        console.log('⚠️  Could not auto-detect Git Bash path. You may need to set CLAUDE_CODE_GIT_BASH_PATH manually.');
    }
}

// 4. Update .mcp.json with local path
console.log('📝 Configuring MCP server paths...');
const mcpConfigPath = path.join(pluginSource, '.mcp.json');
const mcpIndexPath = path.join(pluginSource, 'mcp', 'index.js').replace(/\\/g, '/');

const mcpConfig = {
  mcpServers: {
    autopilot: {
      command: 'node',
      args: [mcpIndexPath]
    }
  }
};

fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
console.log('✅ Configured .mcp.json with local path.');

// 5. Install MCP Dependencies
console.log('📦 Installing MCP dependencies...');
try {
    execSync('npm install', { cwd: path.join(pluginSource, 'mcp'), stdio: 'inherit' });
    console.log('✅ MCP dependencies installed.');
} catch (e) {
    console.error('❌ Failed to install MCP dependencies.');
}

console.log('\n✨ Installation Complete!');
console.log('You can now use /autopilot in any project by just running "claude".');
console.log('Try it: /autopilot "Summarize this project"');
