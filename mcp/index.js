const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "session_store.db");
const db = new sqlite3.Database(dbPath);

// Initialize schema
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS todo_deps (
    todo_id INTEGER,
    depends_on INTEGER,
    FOREIGN KEY(todo_id) REFERENCES todos(id),
    FOREIGN KEY(depends_on) REFERENCES todos(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS inbox_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
});

const server = new Server(
  {
    name: "autopilot-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "sql",
        description: "Execute SQL queries against the local session store",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
      {
        name: "task_complete",
        description: "Mark the autopilot task as complete and exit the loop",
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
          },
          required: ["summary"],
        },
      },
      {
        name: "report_intent",
        description: "Report what the agent is currently doing to the terminal",
        inputSchema: {
          type: "object",
          properties: {
            intent: { type: "string" },
          },
          required: ["intent"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "sql") {
    return new Promise((resolve) => {
      const query = args.query.trim();
      if (query.toLowerCase().startsWith("select")) {
        db.all(query, [], (err, rows) => {
          if (err) resolve({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
          else resolve({ content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] });
        });
      } else {
        db.run(query, [], function (err) {
          if (err) resolve({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
          else resolve({ content: [{ type: "text", text: `Success. Rows affected: ${this.changes}` }] });
        });
      }
    });
  }

  if (name === "task_complete") {
    // In a 1:1 replica, this would signal the orchestrator.
    // We'll print it to stderr with a specific prefix so the orchestrator can catch it easily.
    console.error(`\n---AUTOPILOT_SIGNAL_START---`);
    console.error(`AUTOPILOT_TASK_COMPLETE: ${args.summary}`);
    console.error(`---AUTOPILOT_SIGNAL_END---\n`);
    return {
      content: [{ type: "text", text: "Task marked as complete. Loop terminating..." }],
    };
  }

  if (name === "report_intent") {
    console.error(`[Intent] ${args.intent}`);
    return {
      content: [{ type: "text", text: "Intent reported." }],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
