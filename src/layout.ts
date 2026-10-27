// Pure layout logic, with no Obsidian imports, so it can be tested with plain Node.
//
// The cards and the arrows between them are read as a tree: a card's children
// are the cards its arrows point to. A card with arrows from two parents is
// placed under the first one reached (breadth first), and the other arrow is
// simply drawn across. Cards no arrow reaches are roots.

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Box {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Link {
	from: string;
	to: string;
}

export interface Tree {
	kids: Map<string, string[]>;
	parent: Map<string, string>;
	roots: string[];
}

export interface Gaps {
	/** Horizontal space between a card and its children. */
	col: number;
	/** Vertical space between siblings. */
	row: number;
	/** Vertical space between separate trees. */
	root: number;
}

export const GAPS: Gaps = { col: 80, row: 20, root: 60 };

/** Children are ordered top to bottom by where they are now, so dragging a card above its sibling reorders them. */
export function buildTree(boxes: Box[], links: Link[]): Tree {
	const byId = new Map(boxes.map((b) => [b.id, b]));
	const out = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
	const incoming = new Map<string, number>(boxes.map((b) => [b.id, 0]));
	for (const l of links) {
		if (l.from === l.to || !byId.has(l.from) || !byId.has(l.to)) continue;
		out.get(l.from)?.push(l.to);
		incoming.set(l.to, (incoming.get(l.to) ?? 0) + 1);
	}
	const top = (a: string, b: string) => (byId.get(a)?.y ?? 0) - (byId.get(b)?.y ?? 0) || (byId.get(a)?.x ?? 0) - (byId.get(b)?.x ?? 0);
	const kids = new Map<string, string[]>(boxes.map((b) => [b.id, []]));
	const parent = new Map<string, string>();
	const seen = new Set<string>();
	const roots: string[] = [];
	const visit = (root: string) => {
		roots.push(root);
		seen.add(root);
		const queue = [root];
		while (queue.length) {
			const id = queue.shift() as string;
			for (const c of [...(out.get(id) ?? [])].sort(top)) {
				if (seen.has(c)) continue;
				seen.add(c);
				kids.get(id)?.push(c);
				parent.set(c, id);
				queue.push(c);
			}
		}
	};
	boxes.filter((b) => (incoming.get(b.id) ?? 0) === 0).map((b) => b.id).sort(top).forEach((r) => { if (!seen.has(r)) visit(r); });
	// Cards that only sit on a loop of arrows: start from the topmost.
	boxes.map((b) => b.id).sort(top).forEach((r) => { if (!seen.has(r)) visit(r); });
	return { kids, parent, roots };
}

/**
 * Where every card goes: each card's children in a column to its right,
 * stacked top to bottom and centered on it; separate trees stacked below each
 * other. The first tree keeps its root where it is, so the map doesn't jump.
 */
export function tidy(boxes: Box[], links: Link[], gaps: Gaps = GAPS): Map<string, { x: number; y: number }> {
	const result = new Map<string, { x: number; y: number }>();
	if (!boxes.length) return result;
	const byId = new Map(boxes.map((b) => [b.id, b]));
	const { kids, roots } = buildTree(boxes, links);
	const h = (id: string) => byId.get(id)?.height ?? 0;
	const memo = new Map<string, number>();
	const block = (id: string): number => (kids.get(id) ?? []).reduce((s, c, i) => s + span(c) + (i ? gaps.row : 0), 0);
	const span = (id: string): number => {
		const known = memo.get(id);
		if (known !== undefined) return known;
		const v = Math.max(h(id), block(id));
		memo.set(id, v);
		return v;
	};
	const place = (id: string, x: number, top: number) => {
		const own = h(id);
		const children = block(id);
		const total = Math.max(own, children);
		result.set(id, { x, y: top + (total - own) / 2 });
		let y = top + (total - children) / 2;
		const cx = x + (byId.get(id)?.width ?? 0) + gaps.col;
		for (const c of kids.get(id) ?? []) {
			place(c, cx, y);
			y += span(c) + gaps.row;
		}
	};
	let top = 0;
	for (const r of roots) {
		place(r, 0, top);
		top += span(r) + gaps.root;
	}
	const first = roots[0];
	const anchor = first ? byId.get(first) : undefined;
	const placed = first ? result.get(first) : undefined;
	const dx = anchor && placed ? anchor.x - placed.x : 0;
	const dy = anchor && placed ? anchor.y - placed.y : 0;
	for (const [id, p] of result) result.set(id, { x: Math.round(p.x + dx), y: Math.round(p.y + dy) });
	return result;
}

/** The order study mode walks the cards in: tree by tree, level by level, top to bottom. */
export function studyOrder(boxes: Box[], links: Link[]): string[] {
	const { kids, roots } = buildTree(boxes, links);
	const order: string[] = [];
	for (const r of roots) {
		const queue = [r];
		while (queue.length) {
			const id = queue.shift() as string;
			order.push(id);
			queue.push(...(kids.get(id) ?? []));
		}
	}
	return order;
}

/** Which sides an arrow from a to b should leave and arrive at. */
export function sidesFor(a: Box, b: Box): [Side, Side] {
	if (b.x >= a.x + a.width) return ['right', 'left'];
	if (b.x + b.width <= a.x) return ['left', 'right'];
	return b.y + b.height / 2 >= a.y + a.height / 2 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Where a new child goes before the layout runs: right of its parent, below its last child. */
export function childSpot(parent: Omit<Box, 'id'>, children: Omit<Box, 'id'>[], gaps: Gaps = GAPS): { x: number; y: number } {
	if (!children.length) return { x: parent.x + parent.width + gaps.col, y: parent.y };
	const last = children.reduce((a, b) => (b.y + b.height > a.y + a.height ? b : a));
	return { x: last.x, y: last.y + last.height + gaps.row };
}
