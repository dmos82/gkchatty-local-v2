# Service Restart Loop - Root Cause and Solution

**Date:** 2025-11-08
**Issue:** Claude Code getting stuck in infinite restart loops when trying to start dev services

## Root Cause

### The Problem
When attempting to programmatically restart backend and frontend services, Claude Code was:

1. **Creating Multiple Background Bash Processes**
   - Spawning new `Bash` tool calls with `run_in_background: true`
   - Each call created a new shell session
   - Multiple shells attempting to run `pnpm dev` simultaneously

2. **Port Conflicts**
   - Backend tries to bind to port 4001
   - Frontend tries to bind to port 4003
   - Only ONE process can bind to each port
   - Other processes fail with `EADDRINUSE` errors

3. **Process Accumulation**
   - Failed processes don't automatically clean up
   - Successful processes keep running even when killed by PID
   - `ts-node-dev` and `next dev` processes remain orphaned
   - Multiple background shells remain "running" in Claude's context

4. **Loop Behavior**
   - Claude detects service failure
   - Attempts to kill and restart
   - Creates NEW background shell
   - Port is still occupied by previous process
   - New process fails
   - Repeat indefinitely

## The Problematic Pattern

```javascript
// What Claude was doing (BAD):
1. Bash({ command: "cd backend && pnpm dev", run_in_background: true })
2. Wait a few seconds
3. Check if service is running
4. If not running, create ANOTHER background Bash call
5. Now there are 2+ processes competing for the same port
6. One succeeds, others fail
7. Claude sees failures and creates MORE processes
8. Loop continues...
```

## Evidence from Logs

From BashOutput analysis:
- **5 background Bash shells** running simultaneously
- Shell `5c5d30`: Frontend failed (port 4003 in use)
- Shell `21070f`: Frontend succeeded after killing other process
- Shell `97460b`: Backend killed before completion
- Shell `086b06`: Backend killed (port conflict)
- Shell `b695ff`: Backend succeeded at port 4001

Multiple instances of:
```
Error: listen EADDRINUSE: address already in use :::4003
```

## The Solution

Created `scripts/dev-services.sh` - a proper service management script that:

### Features
1. **Port Detection**
   - Uses `lsof -ti:$PORT` to check if port is in use
   - Prevents starting duplicate services

2. **Safe Stopping**
   - Kills by PID file first
   - Falls back to killing by port
   - Cleans up orphaned processes
   - Uses `pkill -9 -f` for comprehensive cleanup

3. **PID Tracking**
   - Stores PIDs in `/tmp/gkchatty-backend.pid` and `/tmp/gkchatty-frontend.pid`
   - Enables reliable process management

4. **Status Checking**
   - Shows current state of both services
   - Warns before overwriting running services

5. **Log Management**
   - Redirects output to `/tmp/gkchatty-backend.log` and `/tmp/gkchatty-frontend.log`
   - Provides tail commands for monitoring

### Usage

```bash
# Start both services
./scripts/dev-services.sh start

# Stop all services
./scripts/dev-services.sh stop

# Restart services
./scripts/dev-services.sh restart

# Check status
./scripts/dev-services.sh status

# Start individual services
./scripts/dev-services.sh backend
./scripts/dev-services.sh frontend
```

## Rules for Claude Code

**NEVER:**
- ❌ Create multiple background Bash shells for the same service
- ❌ Use `run_in_background: true` for dev servers
- ❌ Attempt programmatic restarts in a loop
- ❌ Kill processes without checking for orphans

**ALWAYS:**
- ✅ Use `./scripts/dev-services.sh` for service management
- ✅ Check status before attempting to start
- ✅ Use `dev-services.sh restart` instead of manual kill + start
- ✅ Ask user to manually restart if script fails

## Why This Happened

Claude Code's behavior was logical but flawed:
1. User asked to "restart the backend"
2. Claude tried to be helpful by doing it automatically
3. Background Bash seemed like the right tool
4. Multiple attempts to "ensure success" created the problem
5. No mechanism to detect multiple simultaneous shells

This is a **systemic issue** with how background processes are managed when:
- The same operation is retried multiple times
- Port conflicts aren't immediately fatal
- Process cleanup isn't comprehensive
- Shell sessions accumulate in context

## Future Prevention

1. **Use the script** - `dev-services.sh` prevents all these issues
2. **Manual restarts** - When in doubt, ask user to restart manually
3. **No loops** - If restart fails twice, stop and report to user
4. **Status checks** - Always check `dev-services.sh status` first

## Testing Results

✅ Script successfully:
- Detected existing backend process
- Stopped all services cleanly
- Started both services without conflicts
- Tracked PIDs correctly
- Provided clear status output

Both services now running:
- Backend: http://localhost:4001 ✓
- Frontend: http://localhost:4003 ✓
