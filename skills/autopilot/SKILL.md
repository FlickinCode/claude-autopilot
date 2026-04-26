---
description: Run a task in autonomous Autopilot mode (mirroring Copilot CLI). Use this for complex, multi-step tasks.
---

# Autopilot Skill

To run a task in autopilot mode, use the following command:

**On Windows:**
```powershell
powershell.exe -File ./bin/autopilot.ps1 "$ARGUMENTS"
```

**On Unix/Linux:**
```bash
./bin/autopilot "$ARGUMENTS"
```

The agent will then enter a loop, managing its own plan via SQL and reporting progress until it calls `task_complete`.
