# Vertex Workflows — Design Brainstorm

> **Status**: Pre-implementation brainstorming. No code written yet.
> **Date**: March 2026
> **Purpose**: Design record and future blog material.
---
## What Are Vertex Workflows?
Workflows are a planned feature for Vertex that lets non-technical users automate actions in their workspace without writing code. They are represented as `.workflow` files — JSON-based text files containing a visual node graph, similar in spirit to Scratch or Unreal Engine Blueprints.
The editor UI is built on [VueFlow](https://vueflow.dev/). Users wire together pre-built function nodes on a canvas to describe what they want to happen — renaming files, filtering by tags, moving entries — and then run the workflow against their current workspace.
**The core design principle**: workflows are purely declarative. There is no embedded scripting language, no `eval`, no shell execution. Every operation a workflow can perform is defined by a fixed registry of built-in node types that ship with Vertex. If a node type doesn't exist in Vertex's codebase, the workflow cannot do it.
---
## The File Format
Workflow files use the `.workflow` extension. Internally they are JSON. The schema wraps VueFlow's `nodes` and `edges` inside a `graph` envelope, keeping Vertex's own metadata cleanly separated from VueFlow's view-state:
```json
{
  "schemaVersion": 1,
  "id": "<uuid>",
  "name": "My Workflow",
  "description": "...",
  "createdAt": "<ISO 8601>",
  "modifiedAt": "<ISO 8601>",
  "permissions": ["workspace.read", "workspace.write"],
  "parameters": [],
  "graph": {
    "nodes": [...],
    "edges": [...]
  }
}
```
**Why the `graph` envelope?** VueFlow's internal node/edge format carries visual state (`position`, `width`, `selected`, `dragging`) that has nothing to do with execution. Wrapping it means that if VueFlow's format changes in a future library version, only the `graph` key needs a migration function — the rest of the schema stays stable. VueFlow's format is not Vertex's schema; it lives inside it.
---
## Execution Model
### Purely Declarative, Closed-World
Workflows cannot execute arbitrary code. The only things a workflow can do are the things Vertex's built-in node registry explicitly allows. This is the primary security guarantee.
The execution engine is a separate Tauri command (`invoke('run_workflow', { graph })`). The frontend only describes the graph and triggers execution. It does not invoke Tauri plugins one by one based on workflow data. This ensures that even if the frontend were somehow compromised, it could not chain arbitrary Tauri calls through a workflow file.
### Dataflow Graph (DAG)
The graph is a DAG (directed acyclic graph) executed via topological sort. Edges carry two different kinds of meaning:
- **Control edges**: sequence — run node B after node A.
- **Data edges**: values — pass node A's output as an input to node B.
  These are represented via typed ports/handles on nodes (as VueFlow supports). Edges in the schema record which output port of the source connects to which input port of the target — not just source node → target node.
### Variables: Two Distinct Concepts
There are two things that look like "variables" but are fundamentally different:
| | Node Parameters | Runtime Variables |
|---|---|---|
| **When they exist** | At design time | Only during execution |
| **Stored in file?** | Yes, on `node.data.params` | No — ephemeral, in executor memory |
| **Example** | "Rename pattern: `{name}_archive`" | Current file in a for-each loop |
| **User-facing role** | Workflow configuration inputs | Internal data flowing through edges |
Node parameters double as "workflow configuration" — users can expose certain parameters at the top level so they appear as a simple form when running the workflow, without needing to touch the graph itself.
### Query Results Are Snapshots
When a query node evaluates (e.g. "find all files tagged `draft`"), the result is captured once as a snapshot at the start of execution. It is not re-evaluated on each loop iteration. This matches the behavior of statically typed languages (Java, C#) and is safer: the loop operates on a known, fixed set, even if the underlying files change mid-run.
---
## Control Flow
Vertex Workflows will support:
- **Conditionals**: if/else branching nodes
- **For loops**: iterate over a collection
- **While / do-while loops**: condition-based repetition
  This makes the system effectively Turing complete. That introduces the risk of non-termination.
### Loop Safety
Loop bounds are enforced **app-side**, not in the workflow file. The app config sets a maximum iteration limit (default: 1,000, user-configurable up to 10,000). Exceeding the limit requires editing the app's config files directly — a deliberate friction that prevents casual misuse while not blocking power users who genuinely need it.
The execution engine also runs a watchdog: a wall-clock timeout that can cancel a running workflow regardless of where it is in the graph.
### The `ForEach` Pattern
"For each file matching query X, do Y" will be the most common real-world workflow pattern by far. It deserves a first-class `ForEach` node that accepts a collection as input and exposes a "current item" output handle — rather than being constructed from a query node + while loop + counter. It is bounded by definition (one iteration per item in the snapshot), safer for non-technical users, and far clearer to read on the canvas.
---
## Security
### Threat Model
The threat: a malicious `.workflow` file is distributed online. A user opens it in Vertex and presses Run.
Since workflows are purely declarative with a closed node registry, the attack surface is dramatically reduced compared to a system that executes embedded code. The remaining vectors are:
- **Path traversal**: a crafted node parameter that resolves to a path outside the workspace root (e.g. `../../sensitive-file`).
- **Destructive bulk operations**: a legitimate-looking workflow that deletes or overwrites many files at once.
- **Permissions abuse**: a workflow that requests broad permissions it doesn't actually need.
### Mitigations
**Permission manifest.** The workflow's `permissions` array declares upfront what capability classes it needs. Before a workflow runs for the first time (or after its content has changed), Vertex shows the user the permission list and asks for explicit approval. Approval is stored locally per workflow ID; the user is only prompted once per new or modified workflow.
**Path confinement.** All file operation nodes resolve paths relative to the workspace root. Any resolved path that escapes the workspace root is rejected by the executor at runtime — not just at validation time.
**Untrusted-by-default.** Workflows not created in this instance of Vertex (detected by the absence of a local trust record) are flagged as untrusted. They run in a read-only dry-run first pass, and require explicit user elevation to execute with write permissions.
**Content integrity hash.** A hash of the `graph` payload is stored in the file. If the hash does not match on load, the user is warned that the workflow may have been tampered with since it was last trusted.
**No network access by default.** `network.*` permissions are opt-in, require a separate prominent confirmation step, and are entirely absent from the default node registry. Most real-world workflows for a note editor will never need network access.
---
## File References & Portability
Workflows reference files using **relative paths**, where `/` is the root of the currently-opened workspace. Absolute paths are never used — they differ between machines and would break portability entirely.
Query nodes (e.g. "all files tagged X", "files matching `*.md`") are the primary way workflows target files dynamically, rather than hardcoding specific paths. This makes shared workflows work across different machines and workspace layouts, as long as the workspace structure is similar.
---
## Undo Semantics
Workflow execution uses the **Command programming pattern** (familiar from Unity's undo system). Each node execution is encapsulated as a command with `Execute()` and `Undo()` methods. The executor builds a reverse-operation log during a run.
### The Irreversible Operation Problem
Hard file deletion cannot be undone. Two options:
1. **Always use the OS trash** instead of hard deleting — deletion becomes reversible, safely addable to the undo stack, and friendlier to non-technical users.
2. **Destructive barrier** — the undo stack clears at a deletion node and the user is warned before execution that undo will not be available past that point.
   The trash approach is the better fit for the target audience.
---
## Schema Version Management
### Workflow Schema Versioning
- A `schemaVersion` integer lives at the top level of every `.workflow` file.
- Breaking changes increment the version. Additive changes do not.
- The app ships a **migration function per major version bump** that transforms an older schema object to the current shape in memory. Migrations never mutate the file on disk unless the user explicitly saves — opening an old workflow in a new version of Vertex doesn't silently rewrite it.
- Migration code is kept indefinitely, one function per version transition ever shipped.
### Node Type Versioning
The schema version governs the shape of the JSON. Individual node types also evolve independently — a "Rename File" node in schema v1 may grow a new required parameter in a later release. Each node instance carries a `nodeTypeVersion` field so migrations can be applied granularly per node type, without every node change forcing a global schema bump.
### History / Branch Versioning
Branch-style versioning (storing revision history inside the `.workflow` file) is explicitly out of scope for the file format. History inside the file means unbounded file size growth and O(history depth) read/write cost. The workspace can already be a git repository; users who want version history get it from git for free. Named checkpoints (if ever implemented) would live in a `.workflow.history` sidecar file, keeping the main file lean and fast to parse.
---
## Future Directions (Out of Scope for V1)
**Workflow as a callable function.** Because node parameters can be designated as "exposed inputs," a workflow already resembles a named function with a signature. The natural extension is a `Run Workflow` node — one workflow invoking another with specific parameter values. This enables composition. It also introduces a workflow-call cycle risk (A calls B calls A), requiring cycle detection at the workflow-invocation level in addition to the graph level.
**Exposed parameter forms.** Certain node parameters can be flagged as top-level inputs, surfaced as a simple fill-in form when a user opens a workflow to run it. Non-technical users never need to touch the graph — they just fill in the fields and press Run.
**Dry-run / preview mode.** Before any workflow with write permissions executes, a preview step simulates the run in read-only mode and shows a diff of what files would be created, renamed, or deleted. Essential for non-technical users and critical for building trust in the feature.
---
## Open Questions (Unresolved)
- How are typed edge ports represented in the schema? (What fields on an edge record the source/target port?)
- Do while/do-while loops stay in V1, or only `ForEach` + conditionals?
- Trash vs. destructive-barrier for deletion — final decision deferred.
- Exact structure of the `parameters` array at the top level.
