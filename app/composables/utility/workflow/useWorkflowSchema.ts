import type {
	WorkflowFileSchemaV1,
	WorkflowGraph,
	WorkflowNode,
	WorkflowEdge,
	WorkflowValidationResult,
	WorkflowValidationError,
} from "#shared/types/editor/workflows";
import {
	defaultWorkflowFileSchemaV1,
	defaultWorkflowGraph,
	defaultWorkflowNode,
	defaultWorkflowEdge,
} from "#shared/utils/defaults/workflows";

export function serializeWorkflowFile(schema: WorkflowFileSchemaV1): string {
	return JSON.stringify(schema, null, 2);
}

export function parseWorkflowFile(json: string): WorkflowFileSchemaV1 {
	const parsed = JSON.parse(json);
	return migrateWorkflowSchema(parsed);
}

export async function computeGraphHash(graph: WorkflowGraph): Promise<string> {
	const normalized = JSON.stringify(
		{ nodes: graph.nodes, edges: graph.edges },
		null,
		0
	);
	const encoder = new TextEncoder();
	const data = encoder.encode(normalized);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildGraphFromVueFlow(
	vueFlowNodes: WorkflowNode[],
	vueFlowEdges: WorkflowEdge[]
): WorkflowGraph {
	const nodes = vueFlowNodes.map((n) => {
		const node = defaultWorkflowNode({
			id: n.id,
			type: n.type,
			position: n.position,
			data: {
				nodeType: n.data?.nodeType ?? "",
				nodeTypeVersion: n.data?.nodeTypeVersion ?? 1,
				params: n.data?.params ?? {},
				exposedInputs: n.data?.exposedInputs ?? [],
				label: n.data?.label,
			},
		});
		return node;
	});

	const edges = vueFlowEdges.map((e) => {
		return defaultWorkflowEdge({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle,
			targetHandle: e.targetHandle,
			edgeType: e.data?.edgeType ?? "control",
			type: e.type,
			animated: e.animated,
		});
	});

	return defaultWorkflowGraph({ nodes, edges });
}

export function buildVueFlowFromGraph(graph: WorkflowGraph) {
	return {
		nodes: graph.nodes.map((n) => ({
			...n,
			type: n.type || "workflowNode",
		})),
		edges: graph.edges.map((e) => ({
			...e,
			type: e.type || "workflowEdge",
		})),
	};
}

export function migrateWorkflowSchema(
	schema: WorkflowFileSchemaV1 | Record<string, unknown>,
	fromVersion?: number
): WorkflowFileSchemaV1 {
	if (!("schemaVersion" in schema)) {
		const v1 = defaultWorkflowFileSchemaV1();
		return Object.assign(v1, schema);
	}

	if (fromVersion === undefined && schema.schemaVersion === 1) {
		return schema as WorkflowFileSchemaV1;
	}

	if (fromVersion !== undefined && fromVersion !== schema.schemaVersion) {
		let current: Record<string, unknown> = schema as Record<string, unknown>;
		for (let v = fromVersion; v < (schema as WorkflowFileSchemaV1).schemaVersion; v++) {
			current = applyMigration(current, v);
		}
		return current as unknown as WorkflowFileSchemaV1;
	}

	return schema as WorkflowFileSchemaV1;
}

function applyMigration(
	schema: Record<string, unknown>,
	_version: number
): Record<string, unknown> {
	return schema;
}

export function validateWorkflowSchema(
	schema: WorkflowFileSchemaV1
): WorkflowValidationResult {
	const errors: WorkflowValidationError[] = [];

	if (!schema.id) {
		errors.push({ message: "Workflow ID is required" });
	}

	if (!schema.name) {
		errors.push({ message: "Workflow name is required" });
	}

	if (!schema.graph) {
		errors.push({ message: "Workflow graph is required" });
	} else {
		const nodeIds = new Set<string>();
		for (const node of schema.graph.nodes) {
			if (nodeIds.has(node.id)) {
				errors.push({
					nodeId: node.id,
					message: `Duplicate node ID: ${node.id}`,
				});
			}
			nodeIds.add(node.id);

			if (!node.data?.nodeType) {
				errors.push({
					nodeId: node.id,
					message: "Node is missing nodeType",
				});
			}
		}

		const edgeIds = new Set<string>();
		for (const edge of schema.graph.edges) {
			if (edgeIds.has(edge.id)) {
				errors.push({
					message: `Duplicate edge ID: ${edge.id}`,
				});
			}
			edgeIds.add(edge.id);

			if (!nodeIds.has(edge.source)) {
				errors.push({
					message: `Edge references unknown source node: ${edge.source}`,
				});
			}

			if (!nodeIds.has(edge.target)) {
				errors.push({
					message: `Edge references unknown target node: ${edge.target}`,
				});
			}
		}

		const graphErrors = detectGraphCycles(schema.graph);
		errors.push(...graphErrors);
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

export function detectGraphCycles(
	graph: WorkflowGraph
): WorkflowValidationError[] {
	const errors: WorkflowValidationError[] = [];
	const adjacency = new Map<string, string[]>();

	for (const node of graph.nodes) {
		adjacency.set(node.id, []);
	}

	for (const edge of graph.edges) {
		if (edge.edgeType === "control") {
			const existing = adjacency.get(edge.source) ?? [];
			existing.push(edge.target);
			adjacency.set(edge.source, existing);
		}
	}

	const visited = new Set<string>();
	const recursionStack = new Set<string>();

	function hasCycleDFS(nodeId: string): string[] | null {
		visited.add(nodeId);
		recursionStack.add(nodeId);

		const neighbors = adjacency.get(nodeId) ?? [];
		for (const neighbor of neighbors) {
			if (!visited.has(neighbor)) {
				const cycle = hasCycleDFS(neighbor);
				if (cycle) {
					return [nodeId, ...cycle];
				}
			} else if (recursionStack.has(neighbor)) {
				return [nodeId, neighbor];
			}
		}

		recursionStack.delete(nodeId);
		return null;
	}

	for (const node of graph.nodes) {
		if (!visited.has(node.id)) {
			const cycle = hasCycleDFS(node.id);
			if (cycle) {
				errors.push({
					message: `Control flow cycle detected: ${cycle.join(" → ")}`,
				});
				break;
			}
		}
	}

	return errors;
}

export function findEntryNodes(graph: WorkflowGraph): WorkflowNode[] {
	const hasIncomingControl = new Set<string>();

	for (const edge of graph.edges) {
		if (edge.edgeType === "control") {
			hasIncomingControl.add(edge.target);
		}
	}

	return graph.nodes.filter((node) => !hasIncomingControl.has(node.id));
}

export function topologicalSort(
	graph: WorkflowGraph
): WorkflowNode[] {
	const inDegree = new Map<string, number>();
	const adjacency = new Map<string, string[]>();

	for (const node of graph.nodes) {
		inDegree.set(node.id, 0);
		adjacency.set(node.id, []);
	}

	for (const edge of graph.edges) {
		if (edge.edgeType === "control") {
			inDegree.set(
				edge.target,
				(inDegree.get(edge.target) ?? 0) + 1
			);
			const existing = adjacency.get(edge.source) ?? [];
			existing.push(edge.target);
			adjacency.set(edge.source, existing);
		}
	}

	const queue: string[] = [];
	for (const [nodeId, degree] of inDegree) {
		if (degree === 0) {
			queue.push(nodeId);
		}
	}

	const sorted: WorkflowNode[] = [];
	const nodeMap = new Map<string, WorkflowNode>();
	for (const node of graph.nodes) {
		nodeMap.set(node.id, node);
	}

	while (queue.length > 0) {
		const nodeId = queue.shift()!;
		const node = nodeMap.get(nodeId);
		if (node) {
			sorted.push(node);
		}

		const neighbors = adjacency.get(nodeId) ?? [];
		for (const neighbor of neighbors) {
			const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
			inDegree.set(neighbor, newDegree);
			if (newDegree === 0) {
				queue.push(neighbor);
			}
		}
	}

	return sorted;
}

export function resolvePathRelative(
	relativePath: string,
	workspaceRoot: string
): string {
	const normalizedRoot = workspaceRoot.endsWith("/")
		? workspaceRoot.slice(0, -1)
		: workspaceRoot;
	const normalizedRelative = relativePath.startsWith("/")
		? relativePath
		: `/${relativePath}`;
	return normalizedRoot + normalizedRelative;
}

export function isPathConfined(
	resolvedPath: string,
	workspaceRoot: string
): boolean {
	const normalizedRoot = workspaceRoot.endsWith("/")
		? workspaceRoot.slice(0, -1)
		: workspaceRoot;
	const normalizedResolved = resolvedPath.endsWith("/")
		? resolvedPath.slice(0, -1)
		: resolvedPath;
	return normalizedResolved.startsWith(normalizedRoot);
}
