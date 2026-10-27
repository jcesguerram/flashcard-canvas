// Obsidian's canvas isn't part of its public API. These are the few parts of
// it this plugin touches, typed loosely: everything optional is checked before
// use, so a change in a future Obsidian version fails quietly instead of
// breaking the canvas.

import type { ItemView, TFile } from 'obsidian';
import type { AllCanvasNodeData, CanvasData, CanvasEdgeData, NodeSide } from 'obsidian/canvas';

export interface CodeMirrorLike {
	dispatch(spec: { selection: { anchor: number; head: number } }): void;
	focus(): void;
}

export interface CanvasNodeLike {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	nodeEl: HTMLElement;
	isEditing: boolean;
	canvas: CanvasLike;
	getData(): AllCanvasNodeData;
	setData(data: AllCanvasNodeData): void;
	startEditing?(): void;
	child?: { editMode?: { cm?: CodeMirrorLike } };
}

export interface CanvasEdgeLike {
	id: string;
	from: { node: CanvasNodeLike; side: NodeSide };
	to: { node: CanvasNodeLike; side: NodeSide };
	getData(): CanvasEdgeData;
	setData(data: CanvasEdgeData): void;
	render?(): void;
}

export interface BBoxLike {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface CanvasLike {
	nodes: Map<string, CanvasNodeLike>;
	edges: Map<string, CanvasEdgeLike>;
	selection: Set<unknown>;
	wrapperEl: HTMLElement;
	canvasEl: HTMLElement;
	canvasControlsEl?: HTMLElement;
	readonly?: boolean;
	isDragging?: boolean;
	view: CanvasViewLike;
	getData(): CanvasData;
	importData(data: Pick<CanvasData, 'nodes' | 'edges'>, clearCanvas?: boolean): void;
	requestSave(): void;
	requestFrame?(): void;
	pushHistory?(data: CanvasData): void;
	markMoved?(node: CanvasNodeLike): void;
	selectOnly?(element: unknown): void;
	zoomToSelection?(): void;
	getViewportBBox?(): BBoxLike;
	createTextNode?(options: Record<string, unknown>): CanvasNodeLike;
}

export interface CanvasViewLike extends ItemView {
	canvas?: CanvasLike;
	file: TFile | null;
}
