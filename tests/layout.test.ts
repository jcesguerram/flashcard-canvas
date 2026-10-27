import assert from 'node:assert/strict';
import { buildTree, childSpot, GAPS, sidesFor, studyOrder, tidy, type Box, type Link } from '../src/layout';

let failed = 0;
function test(name: string, fn: () => void) {
	try {
		fn();
		console.log('  ✓ ' + name);
	} catch (e) {
		failed++;
		console.log('  ✗ ' + name);
		console.log(e);
	}
}

const box = (id: string, x: number, y: number, height = 60, width = 260): Box => ({ id, x, y, width, height });
const link = (from: string, to: string): Link => ({ from, to });

test('children are ordered by where they are, top to bottom', () => {
	const boxes = [box('r', 0, 0), box('a', 400, 200), box('b', 400, -100), box('c', 400, 50)];
	const t = buildTree(boxes, [link('r', 'a'), link('r', 'b'), link('r', 'c')]);
	assert.deepEqual(t.roots, ['r']);
	assert.deepEqual(t.kids.get('r'), ['b', 'c', 'a']);
	assert.equal(t.parent.get('a'), 'r');
});

test('a card with two parents goes under the first one reached', () => {
	// r → a → x, r → b → x : x is reached from a (a is above b).
	const boxes = [box('r', 0, 0), box('a', 400, 0), box('b', 400, 100), box('x', 800, 50)];
	const t = buildTree(boxes, [link('r', 'a'), link('r', 'b'), link('a', 'x'), link('b', 'x')]);
	assert.equal(t.parent.get('x'), 'a');
	assert.deepEqual(t.kids.get('b'), []);
});

test('loops and unconnected cards still get placed', () => {
	const boxes = [box('a', 0, 0), box('b', 300, 0), box('lone', 0, 500)];
	const t = buildTree(boxes, [link('a', 'b'), link('b', 'a')]);
	assert.deepEqual(new Set(t.roots), new Set(['lone', 'a']));
	const spots = tidy(boxes, [link('a', 'b'), link('b', 'a')]);
	assert.equal(spots.size, 3);
});

test('tidy puts children in a column to the right, centered on the parent', () => {
	const boxes = [box('r', 100, 100, 60), box('a', 0, 0, 40), box('b', 0, 300, 80)];
	const spots = tidy(boxes, [link('r', 'a'), link('r', 'b')]);
	const r = spots.get('r'), a = spots.get('a'), b = spots.get('b');
	assert.ok(r && a && b);
	// The root stays where it was.
	assert.deepEqual(r, { x: 100, y: 100 });
	// Children one column to the right.
	assert.equal(a.x, 100 + 260 + GAPS.col);
	assert.equal(b.x, a.x);
	// Stacked with the row gap, a above b.
	assert.equal(b.y, a.y + 40 + GAPS.row);
	// The block of children (40 + 20 + 80 = 140) is centered on the root (60 tall).
	assert.equal(a.y + 140 / 2, r.y + 60 / 2);
});

test('tidy is stable: running it twice changes nothing', () => {
	const boxes = [box('r', 0, 0), box('a', 900, 40, 120), box('b', 10, 999), box('c', 5, -300), box('d', 0, 2000)];
	const links = [link('r', 'a'), link('r', 'b'), link('b', 'c'), link('a', 'd')];
	const first = tidy(boxes, links);
	const moved = boxes.map((bx) => ({ ...bx, ...first.get(bx.id) }));
	const second = tidy(moved, links);
	for (const [id, p] of first) assert.deepEqual(second.get(id), p, id);
});

test('separate trees are stacked below each other without overlapping', () => {
	const boxes = [box('r1', 0, 0, 100), box('k1', 500, 0, 300), box('r2', 0, 50, 60)];
	const spots = tidy(boxes, [link('r1', 'k1')]);
	const r1 = spots.get('r1'), r2 = spots.get('r2'), k1 = spots.get('k1');
	assert.ok(r1 && r2 && k1);
	assert.equal(r2.y, k1.y + 300 + GAPS.root);
});

test('study order follows the arrows level by level', () => {
	const boxes = [box('r', 0, 0), box('a', 400, 0), box('b', 400, 100), box('a1', 800, 0)];
	assert.deepEqual(studyOrder(boxes, [link('r', 'a'), link('r', 'b'), link('a', 'a1')]), ['r', 'a', 'b', 'a1']);
});

test('arrow sides follow where the cards are', () => {
	assert.deepEqual(sidesFor(box('a', 0, 0), box('b', 400, 0)), ['right', 'left']);
	assert.deepEqual(sidesFor(box('a', 400, 0), box('b', 0, 0)), ['left', 'right']);
	assert.deepEqual(sidesFor(box('a', 0, 0), box('b', 0, 200)), ['bottom', 'top']);
	assert.deepEqual(sidesFor(box('a', 0, 200), box('b', 0, 0)), ['top', 'bottom']);
});

test('a new child goes right of its parent, or below its last child', () => {
	const parent = box('p', 0, 0, 60);
	assert.deepEqual(childSpot(parent, []), { x: 260 + GAPS.col, y: 0 });
	assert.deepEqual(childSpot(parent, [box('a', 340, -40, 50), box('b', 340, 30, 70)]), { x: 340, y: 30 + 70 + GAPS.row });
});

if (failed) {
	console.log(`${failed} failed`);
	process.exit(1);
}
