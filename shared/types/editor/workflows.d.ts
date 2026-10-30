import type { Node, Edge } from "@vue-flow/core";

export type WorkflowSchemaVersion = 1;

export type WorkflowPermissions =
	| "workspace.read"
	| "workspace.write"
	| "network.opt-in";

export type WorkflowNodeCategory =
	| "query"
	| "flow"
	| "action"
	| "property"
	| "group";

export type WorkflowParameterType =
	| "string"
	| "number"
	| "boolean"
	| "array"
	| "object"
	| "glob"
	| "tag"
	| "filepath";

export interface WorkflowParameterDefinition {
	id: string;
	label: string;
	type: WorkflowParameterType;
	defaultValue?: unknown;
	required?: boolean;
	description?: string;
}

export interface WorkflowNodePort {
	id: string;
	type: "control" | "data";
	dataType?: WorkflowParameterType;
	label: string;
}

export interface WorkflowNodePortDefinition {
	inputs: WorkflowNodePort[];
	outputs: WorkflowNodePort[];
}

export interface WorkflowNodeTypeDefinition {
	type: string;
	label: string;
	icon: string;
	category: WorkflowNodeCategory;
	color?: string;
	ports: WorkflowNodePortDefinition;
	params: WorkflowParameterDefinition[];
	exposedInputs?: string[];
}

export interface WorkflowNodeData {
	nodeType: string;
	nodeTypeVersion: number;
	params: Record<string, unknown>;
	exposedInputs: string[];
	label?: string;
	subGraph?: WorkflowGraph;
	inputMapping?: Record<string, string>;
	outputMapping?: Record<string, string>;
}

export type WorkflowNode = Node<WorkflowNodeData>;

export type WorkflowEdge = Edge & {
	sourceHandle?: string | null;
	targetHandle?: string | null;
	edgeType?: "control" | "data";
	data?: {
		edgeType?: "control" | "data";
	};
};

export interface WorkflowGraph {
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
}

export interface WorkflowParameter {
	id: string;
	label: string;
	type: WorkflowParameterType;
	defaultValue?: unknown;
	value?: unknown;
	exposed: boolean;
}

export interface WorkflowFileSchemaV1 {
	schemaVersion: WorkflowSchemaVersion;
	id: string;
	name: string;
	description: string;
	createdAt: string;
	modifiedAt: string;
	permissions: WorkflowPermissions[];
	parameters: WorkflowParameter[];
	graph: WorkflowGraph;
	graphHash?: string;
}

export interface WorkflowExecutionState {
	status: "idle" | "running" | "paused" | "completed" | "failed" | "stopped";
	currentNodeId?: string;
	progress?: number;
	error?: string;
	startedAt?: Date;
	completedAt?: Date;
}

export interface WorkflowRuntimeVariable {
	name: string;
	type: WorkflowParameterType;
	value: unknown;
}

export interface WorkflowUndoCommand {
	nodeId: string;
	description: string;
	execute: () => Promise<void>;
	undo: () => Promise<void>;
}

export interface WorkflowExecutionContext {
	workspaceRoot: string;
	permissions: WorkflowPermissions[];
	variables: Map<string, WorkflowRuntimeVariable>;
	snapshotFiles: Map<string, unknown[]>;
	loopIterationCount: number;
	stackDepth: number;
	undoStack: WorkflowUndoCommand[];
	errors: Array<{ nodeId: string; message: string; timestamp: Date }>;
	onNodeStart?: (nodeId: string) => void;
	onNodeComplete?: (nodeId: string, output: unknown) => void;
	onNodeError?: (nodeId: string, error: Error) => void;
	onLoopIteration?: (nodeId: string, iteration: number) => void;
}

export interface WorkflowNodeExecutor {
	execute(
		node: WorkflowNode,
		context: WorkflowExecutionContext
	): Promise<Record<string, unknown>>;
}

export interface WorkflowNodeExecutorResult {
	outputs: Record<string, unknown>;
	control: "then" | "body" | "done" | "true" | "false" | "continue" | "break";
	nextNodeIds: string[];
}

export type WorkflowSettingsDestructiveBehavior =
	| "always-allow"
	| "always-ask"
	| "never";

export type WorkflowSettingsRunBehavior = "stop-on-error" | "ignore-error";

export interface WorkflowSettings {
	destructiveBehavior: WorkflowSettingsDestructiveBehavior;
	runBehavior: WorkflowSettingsRunBehavior;
	maxLoopIterations: number;
	maxStackDepth: number;
	wallClockTimeoutMs: number;
}

export interface WorkflowTrustedRecord {
	workflowId: string;
	trustedAt: Date;
	permissions: WorkflowPermissions[];
}

export interface WorkflowValidationError {
	nodeId?: string;
	field?: string;
	message: string;
}

export interface WorkflowValidationResult {
	valid: boolean;
	errors: WorkflowValidationError[];
}
