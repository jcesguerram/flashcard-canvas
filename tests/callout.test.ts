import assert from 'node:assert/strict';
import { cleanType, isCard, isOpen, readCard, setFold, template, titleRange, toggleFold } from '../src/callout';

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

const card = '> [!pregunta]+ What is present value?\n> The value today of money you receive later.';

test('reads a foldable callout as a card', () => {
	assert.deepEqual(readCard(card), { type: 'pregunta', fold: '+' });
	assert.deepEqual(readCard('>[!pregunta]- p\n> a'), { type: 'pregunta', fold: '-' });
	assert.equal(isCard('  > [!faq]+ x'), true);
});

test('callouts that do not fold, and other text, are not cards', () => {
	assert.equal(readCard('> [!pregunta] p\n> a'), null);
	assert.equal(readCard('Just a note'), null);
	assert.equal(readCard('Intro\n> [!pregunta]+ p'), null);
	assert.equal(readCard(''), null);
	assert.equal(readCard(undefined), null);
});

test('toggles and sets the fold marker, touching nothing else', () => {
	const folded = toggleFold(card);
	assert.equal(folded, card.replace(']+', ']-'));
	assert.equal(isOpen(folded), false);
	assert.equal(toggleFold(folded), card);
	assert.equal(setFold(card, '+'), card);
	assert.equal(setFold('plain text', '-'), 'plain text');
	assert.equal(toggleFold('plain text'), 'plain text');
});

test('only the first line is changed', () => {
	const text = '> [!pregunta]+ q\n> [!note]+ inner\n> a';
	assert.equal(toggleFold(text), '> [!pregunta]- q\n> [!note]+ inner\n> a');
});

test('builds the template from the settings', () => {
	assert.equal(template({ type: 'pregunta', question: 'p', answer: 'a', open: true }), '> [!pregunta]+ p\n> a');
	assert.equal(template({ type: 'pregunta', question: 'p', answer: 'a', open: false }), '> [!pregunta]- p\n> a');
	assert.equal(template({ type: ' my type ', question: 'q', answer: 'line 1\nline 2', open: true }), '> [!my-type]+ q\n> line 1\n> line 2');
	assert.equal(cleanType(''), 'question');
});

test('finds the title so it can be selected', () => {
	const text = '> [!pregunta]+ p\n> a';
	const r = titleRange(text);
	assert.ok(r);
	assert.equal(text.slice(r.from, r.to), 'p');
	const long = '>[!pregunta]-   What is it?\n> a';
	const r2 = titleRange(long);
	assert.ok(r2);
	assert.equal(long.slice(r2.from, r2.to), 'What is it?');
	assert.equal(titleRange('nothing'), null);
});

if (failed) {
	console.log(`${failed} failed`);
	process.exit(1);
}
