import type {
	WorkflowFileSchemaV1,
	WorkflowGraph,
	WorkflowNode,
	WorkflowEdge,
	WorkflowNodeData,
	WorkflowParameter,
	WorkflowNodeTypeDefinition,
	WorkflowSettings,
	WorkflowExecutionState,
	WorkflowExecutionContext,
	WorkflowRuntimeVariable,
} from "#shared/types/editor/workflows";
import useUuid from "~/composables/utility/useUuid";

export function defaultWorkflowSettings(
	data?: Partial<WorkflowSettings>
): WorkflowSettings {
	return {
		destructiveBehavior: data?.destructiveBehavior ?? "always-ask",
		runBehavior: data?.runBehavior ?? "stop-on-error",
		maxLoopIterations: data?.maxLoopIterations ?? 1000,
		maxStackDepth: data?.maxStackDepth ?? 10,
		wallClockTimeoutMs: data?.wallClockTimeoutMs ?? 30000,
	};
}

export function defaultWorkflowNodeData(
	data?: Partial<WorkflowNodeData>
): WorkflowNodeData {
	return {
		nodeType: data?.nodeType ?? "",
		nodeTypeVersion: data?.nodeTypeVersion ?? 1,
		params: data?.params ?? {},
		exposedInputs: data?.exposedInputs ?? [],
		label: data?.label ?? "",
		subGraph: data?.subGraph,
		inputMapping: data?.inputMapping,
		outputMapping: data?.outputMapping,
	};
}

export function defaultWorkflowNode(
	data?: Partial<WorkflowNode>
): WorkflowNode {
	return {
		id: data?.id ?? useUuid(),
		type: data?.type ?? "workflowNode",
		position: data?.position ?? { x: 0, y: 0 },
		data: data?.data ?? defaultWorkflowNodeData(),
	};
}

export function defaultWorkflowEdge(
	data?: Partial<WorkflowEdge>
): WorkflowEdge {
	return {
		id: data?.id ?? `e-${useUuid()}`,
		source: data?.source ?? "",
		target: data?.target ?? "",
		sourceHandle: data?.sourceHandle ?? null,
		targetHandle: data?.targetHandle ?? null,
		edgeType: data?.edgeType ?? "control",
		data: data?.data ?? { edgeType: data?.edgeType ?? "control" },
		type: data?.type ?? "workflowEdge",
		animated: data?.animated ?? false,
	};
}

export function defaultWorkflowGraph(
	data?: Partial<WorkflowGraph>
): WorkflowGraph {
	return {
		nodes: data?.nodes ?? [],
		edges: data?.edges ?? [],
	};
}

export function defaultWorkflowParameter(
	data?: Partial<WorkflowParameter>
): WorkflowParameter {
	return {
		id: data?.id ?? useUuid(),
		label: data?.label ?? "",
		type: data?.type ?? "string",
		defaultValue: data?.defaultValue,
		value: data?.value,
		exposed: data?.exposed ?? false,
	};
}

export function defaultWorkflowFileSchemaV1(
	data?: Partial<WorkflowFileSchemaV1>
): WorkflowFileSchemaV1 {
	const now = new Date().toISOString();
	return {
		schemaVersion: 1,
		id: data?.id ?? useUuid(),
		name: data?.name ?? "Untitled Workflow",
		description: data?.description ?? "",
		createdAt: data?.createdAt ?? now,
		modifiedAt: data?.modifiedAt ?? now,
		permissions: data?.permissions ?? [],
		parameters: data?.parameters ?? [],
		graph: data?.graph ?? defaultWorkflowGraph(),
		graphHash: data?.graphHash,
	};
}

export function defaultWorkflowExecutionState(
	data?: Partial<WorkflowExecutionState>
): WorkflowExecutionState {
	return {
		status: data?.status ?? "idle",
		currentNodeId: data?.currentNodeId,
		progress: data?.progress,
		error: data?.error,
		startedAt: data?.startedAt,
		completedAt: data?.completedAt,
	};
}

export function defaultWorkflowRuntimeVariable(
	data?: Partial<WorkflowRuntimeVariable>
): WorkflowRuntimeVariable {
	return {
		name: data?.name ?? "",
		type: data?.type ?? "string",
		value: data?.value,
	};
}

export function defaultWorkflowExecutionContext(
	data?: Partial<WorkflowExecutionContext>
): WorkflowExecutionContext {
	return {
		workspaceRoot: data?.workspaceRoot ?? "",
		permissions: data?.permissions ?? [],
		variables: data?.variables ?? new Map(),
		snapshotFiles: data?.snapshotFiles ?? new Map(),
		loopIterationCount: data?.loopIterationCount ?? 0,
		stackDepth: data?.stackDepth ?? 0,
		undoStack: data?.undoStack ?? [],
		errors: data?.errors ?? [],
		onNodeStart: data?.onNodeStart,
		onNodeComplete: data?.onNodeComplete,
		onNodeError: data?.onNodeError,
		onLoopIteration: data?.onLoopIteration,
	};
}
