# Claude Autopilot Orchestrator (PowerShell Version)
# Mirrors Copilot CLI Autopilot 1:1

param (
    [string]$Task
)

# Set the Git Bash path for Claude Code
$env:CLAUDE_CODE_GIT_BASH_PATH = "D:/Git/bin/bash.exe"

if (-not $Task) {
    Write-Host "Usage: autopilot.ps1 -Task 'task description'"
    exit 1
}

$MAX_TURNS = 15
$TURN = 0
$DB_PATH = "C:/Users/bmile/claude-autopilot/mcp/session_store.db"

Write-Host "[Autopilot] Starting task: $Task"

# Function to get todo status from SQL
function Get-TodoStatus {
    if (Test-Path $DB_PATH) {
        $NODE_PATH = "C:/Users/bmile/claude-autopilot/mcp/node_modules"
        $env:NODE_PATH = $NODE_PATH
        $status = node -e "
            const sqlite3 = require('sqlite3').verbose();
            const db = new sqlite3.Database('$DB_PATH');
            db.all('SELECT status, COUNT(*) as count FROM todos GROUP BY status', [], (err, rows) => {
                if (err) { process.stdout.write('0 in progress, 0 done (0 total)'); process.exit(0); }
                const stats = { in_progress: 0, done: 0, total: 0 };
                rows.forEach(row => {
                    if (row.status === 'in_progress') stats.in_progress = row.count;
                    if (row.status === 'done') stats.done = row.count;
                    stats.total += row.count;
                });
                process.stdout.write(\`\${stats.in_progress} in progress, \${stats.done} done (\${stats.total} total)\`);
                db.close();
            });
        " 2>$null
        return if ($status) { $status } else { "0 in progress, 0 done (0 total)" }
    } else {
        return "0 in progress, 0 done (0 total)"
    }
}

# Initial turn
Write-Host "[Autopilot] Initializing Claude session..."
$output = claude -p "$Task" --permission-mode bypassPermissions --plugin-dir . 2>&1

while ($TURN -lt $MAX_TURNS) {
    $TURN++
    Write-Host "--------------------------------------------------"
    Write-Host "[Autopilot] Turn $TURN/$MAX_TURNS"
    Write-Host "$output"

    # 1. Check for termination signal
    if ($output -like "*AUTOPILOT_TASK_COMPLETE*") {
        $summary = ($output | Select-String "AUTOPILOT_TASK_COMPLETE: (.*)").Matches.Groups[0].Value -replace "AUTOPILOT_TASK_COMPLETE: ", ""
        Write-Host "--------------------------------------------------"
        Write-Host "[Autopilot] Task Complete!"
        Write-Host "Summary: $summary"
        exit 0
    }

    # 2. Catch fatal errors (Claude CLI failing or empty output)
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Host "--------------------------------------------------"
        Write-Host "[Autopilot] ERROR: Claude CLI failed with exit code $LASTEXITCODE"
        exit 1
    }

    # 3. Transformed Content Injection
    $currentTime = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $todoStatus = Get-TodoStatus
    
    $reminder = @"
<current_datetime>$currentTime</current_datetime>
<tools_changed_notice>New tools available: task_complete</tools_changed_notice>

You have not yet marked the task as complete using the task_complete tool. If you were planning, stop planning and start implementing. You aren't done until you have fully completed the task.

IMPORTANT: Do NOT call task_complete if:
- You have open questions or ambiguities - make good decisions and keep working
- You encountered an error - try to resolve it or find an alternative approach
- There are remaining steps - complete them first

Keep working autonomously until the task is truly finished, then call task_complete.

<reminder>
<sql_tables>Available tables: todos, todo_deps, inbox_entries</sql_tables>
</reminder>
<reminder>
<todo_status>
Todos: $todoStatus
Use sql tool to query ready todos and update status as you work.
</todo_status>
</reminder>
"@

    Write-Host "[Autopilot] Continuing..."
    
    # Resume turn
    $output = claude -p "$reminder" --permission-mode bypassPermissions --plugin-dir . 2>&1
}

Write-Host "--------------------------------------------------"
Write-Host "[Autopilot] ERROR: Maximum turn limit ($MAX_TURNS) reached. Looping detected or task too complex."
exit 1
